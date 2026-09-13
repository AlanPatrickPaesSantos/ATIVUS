import mongoose from 'mongoose'
import { mkdir, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { connectToDatabase, disconnectFromDatabase } from '../mongoose.js'
import { UserModel } from '../../models/User.js'

type UserSituation = 'active' | 'blocked' | 'inactive'

export interface BackfillUserSituationOptions {
  dryRun?: boolean
  cleanupLegacyActive?: boolean
  reportPath?: string
}

export interface BackfillUserSituationResult {
  matchedCount: number
  modifiedCount: number
  wouldModifyCount: number
  cleanupAppliedCount: number
  legacyActivePreservedCount: number
  dryRun: boolean
  reportPath: string | null
  reportEntries: BackfillUserSituationReportEntry[]
}

export interface BackfillUserSituationReportEntry {
  activePolicy: 'cleanup' | 'preserve' | 'none'
  id: string
  nextSituation: UserSituation
  previousSituation: string
}

type ActivePolicy = BackfillUserSituationReportEntry['activePolicy']

interface LegacyUserRecord {
  _id: mongoose.Types.ObjectId
  registration?: string
  active?: unknown
  situation?: unknown
}

function hasOwn(value: object, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(value, key)
}

function normalizeSituation(user: LegacyUserRecord): UserSituation {
  if (user.situation === 'blocked') return 'blocked'
  if (user.situation === 'inactive') return 'inactive'

  if (user.situation === 'active') {
    if (user.active === true || !hasOwn(user as object, 'active')) {
      return 'active'
    }

    return 'inactive'
  }

  if ((user.situation === null || user.situation === undefined) && user.active === true) {
    return 'active'
  }

  return 'inactive'
}

function needsSituationUpdate(user: LegacyUserRecord, nextSituation: UserSituation): boolean {
  return user.situation !== nextSituation
}

function previousSituationLabel(value: unknown): string {
  if (value === undefined) return 'missing'
  if (value === null) return 'null'
  if (typeof value === 'string' && value.length > 0) return value
  return String(value)
}

function migrationReport(result: BackfillUserSituationResult): string {
  return [
    '# Backfill user situation report',
    '',
    `Dry run: ${result.dryRun ? 'yes' : 'no'}`,
    `Matched: ${result.matchedCount}`,
    `Would modify: ${result.wouldModifyCount}`,
    `Modified: ${result.modifiedCount}`,
    `Cleanup applied: ${result.cleanupAppliedCount}`,
    `Legacy active preserved: ${result.legacyActivePreservedCount}`,
    '',
    '## Document ledger',
    ...result.reportEntries.map((entry) => `- id=${entry.id} previous=${entry.previousSituation} next=${entry.nextSituation} activePolicy=${entry.activePolicy}`),
  ].join('\n')
}

async function writeReport(reportPath: string, result: BackfillUserSituationResult): Promise<void> {
  const resolved = resolve(reportPath)
  await mkdir(dirname(resolved), { recursive: true })
  await writeFile(resolved, migrationReport(result), 'utf8')
}

export async function backfillUserSituation(options: BackfillUserSituationOptions = {}): Promise<BackfillUserSituationResult> {
  const dryRun = options.dryRun ?? false
  const cleanupLegacyActive = options.cleanupLegacyActive ?? false
  const users = await UserModel.collection.find({}, { projection: { _id: 1, registration: 1, active: 1, situation: 1 } }).toArray() as LegacyUserRecord[]

  const mutations = users.map((user) => {
    const nextSituation = normalizeSituation(user)
    const hasLegacyActive = hasOwn(user as object, 'active')

    return {
      id: user._id,
      registration: user.registration ?? null,
      previousSituation: previousSituationLabel(user.situation),
      nextSituation,
      shouldUpdateSituation: needsSituationUpdate(user, nextSituation),
      shouldCleanupLegacyActive: cleanupLegacyActive && hasLegacyActive,
      hasLegacyActive,
      activePolicy: (hasLegacyActive ? (cleanupLegacyActive ? 'cleanup' : 'preserve') : 'none') as ActivePolicy,
    }
  })

  const situationWrites = mutations.filter((mutation) => mutation.shouldUpdateSituation)
  const cleanupWrites = mutations.filter((mutation) => mutation.shouldCleanupLegacyActive)

  if (!dryRun) {
    if (situationWrites.length > 0) {
      await UserModel.collection.bulkWrite(
        situationWrites.map((mutation) => ({
          updateOne: {
            filter: { _id: mutation.id },
            update: { $set: { situation: mutation.nextSituation } },
          },
        })),
      )
    }

    if (cleanupWrites.length > 0) {
      await UserModel.collection.bulkWrite(
        cleanupWrites.map((mutation) => ({
          updateOne: {
            filter: { _id: mutation.id },
            update: { $unset: { active: '' } },
          },
        })),
      )
    }
  }

  const result: BackfillUserSituationResult = {
    matchedCount: users.length,
    modifiedCount: dryRun ? 0 : situationWrites.length,
    wouldModifyCount: situationWrites.length,
    cleanupAppliedCount: dryRun ? 0 : cleanupWrites.length,
    legacyActivePreservedCount: cleanupLegacyActive ? 0 : mutations.filter((mutation) => mutation.hasLegacyActive).length,
    dryRun,
    reportPath: options.reportPath ? resolve(options.reportPath) : null,
    reportEntries: mutations.map((mutation) => ({
      activePolicy: mutation.activePolicy,
      id: mutation.id.toString(),
      nextSituation: mutation.nextSituation,
      previousSituation: mutation.previousSituation,
    })),
  }

  if (options.reportPath) {
    await writeReport(options.reportPath, result)
  }

  return result
}

function parseCliArguments(argv: string[]) {
  let dryRun = false
  let cleanupLegacyActive = false
  let reportPath: string | undefined

  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index]

    if (argument === '--dry-run') {
      dryRun = true
      continue
    }

    if (argument === '--cleanup-legacy-active') {
      cleanupLegacyActive = true
      continue
    }

    if (argument === '--report') {
      reportPath = argv[index + 1]
      index += 1
    }
  }

  return { dryRun, cleanupLegacyActive, reportPath }
}

if (process.argv[1]?.endsWith('backfillUserSituation.js') || process.argv[1]?.endsWith('backfillUserSituation.ts')) {
  await connectToDatabase()
  try {
    const result = await backfillUserSituation(parseCliArguments(process.argv.slice(2)))
    console.log(`Backfilled ${result.modifiedCount} user situations (matched ${result.matchedCount}, dryRun=${result.dryRun}, wouldModify=${result.wouldModifyCount}, cleanupApplied=${result.cleanupAppliedCount}).`)
    if (result.reportPath) {
      console.log(`Report written to ${result.reportPath}.`)
    }
  } finally { await disconnectFromDatabase() }
}
