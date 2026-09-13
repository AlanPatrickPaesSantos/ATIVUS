import mongoose from 'mongoose'
import { MongoMemoryServer } from 'mongodb-memory-server'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'
import { connectToDatabase, disconnectFromDatabase } from '../mongoose.js'
import { UserModel } from '../../models/User.js'
import { backfillUserSituation } from './backfillUserSituation.js'

describe('backfillUserSituation', () => {
  let server: MongoMemoryServer
  beforeAll(async () => { server = await MongoMemoryServer.create(); await connectToDatabase(server.getUri()) })
  afterEach(async () => { await UserModel.collection.deleteMany({}) })
  afterAll(async () => { await disconnectFromDatabase(); await server.stop() })

  it('converts legacy active values and is idempotent', async () => {
    await UserModel.collection.insertMany([
      { name: 'Ativo', registration: '1', role: 'ditel_admin', active: true, unit: null, passwordHash: 'hash' },
      { name: 'Inativo', registration: '2', role: 'ditel_admin', active: false, unit: null, passwordHash: 'hash' },
      { name: 'Nulo', registration: '3', role: 'ditel_admin', active: true, situation: null, unit: null, passwordHash: 'hash' },
    ])
    const first = await backfillUserSituation()
    expect(first.modifiedCount).toBe(3)
    expect(await UserModel.collection.find({}, { projection: { _id: 0, situation: 1 } }).sort({ registration: 1 }).toArray()).toEqual([{ situation: 'active' }, { situation: 'inactive' }, { situation: 'active' }])
    expect((await backfillUserSituation()).modifiedCount).toBe(0)
  })

  it('fails closed for invalid and contradictory legacy states', async () => {
    await UserModel.collection.insertMany([
      { name: 'Situação inválida', registration: '4', role: 'ditel_admin', active: true, situation: 'unknown', unit: null, passwordHash: 'hash' },
      { name: 'Conflito ativo', registration: '5', role: 'ditel_admin', active: false, situation: 'active', unit: null, passwordHash: 'hash' },
      { name: 'Bloqueado legado', registration: '6', role: 'ditel_admin', active: true, situation: 'blocked', unit: null, passwordHash: 'hash' },
      { name: 'Flag inválida', registration: '7', active: 'true', role: 'ditel_admin', unit: null, passwordHash: 'hash' },
      { name: 'Ativo com flag inválida', registration: '10', active: 'true', role: 'ditel_admin', situation: 'active', unit: null, passwordHash: 'hash' },
    ])

    const first = await backfillUserSituation()

    expect(first.modifiedCount).toBe(4)
    expect(await UserModel.collection.find({}, { projection: { _id: 0, registration: 1, situation: 1 } }).sort({ registration: 1 }).toArray()).toEqual([
      { registration: '10', situation: 'inactive' },
      { registration: '4', situation: 'inactive' },
      { registration: '5', situation: 'inactive' },
      { registration: '6', situation: 'blocked' },
      { registration: '7', situation: 'inactive' },
    ])
    expect((await backfillUserSituation()).modifiedCount).toBe(0)
  })

  it('supports dry-run reporting and only removes legacy active when cleanup is explicit', async () => {
    const reportDir = await mkdtemp(join(tmpdir(), 'sigat-backfill-'))
    const reportPath = join(reportDir, 'report.md')

    try {
      await UserModel.collection.insertMany([
        { name: 'Ativo legado', registration: '8', role: 'ditel_admin', active: true, unit: null, passwordHash: 'hash' },
        { name: 'Inativo legado', registration: '9', role: 'ditel_admin', active: false, unit: null, passwordHash: 'hash' },
      ])

      const dryRun = await backfillUserSituation({ dryRun: true, reportPath })

      expect(dryRun).toMatchObject({
        dryRun: true,
        matchedCount: 2,
        modifiedCount: 0,
        wouldModifyCount: 2,
        cleanupAppliedCount: 0,
        legacyActivePreservedCount: 2,
        reportPath,
      })
      expect(await UserModel.collection.find({}, { projection: { _id: 0, registration: 1, situation: 1, active: 1 } }).sort({ registration: 1 }).toArray()).toEqual([
        { registration: '8', active: true },
        { registration: '9', active: false },
      ])

      const report = await readFile(reportPath, 'utf8')
      expect(report).toContain('Dry run: yes')
      expect(report).toContain('Would modify: 2')
      expect(report).toContain('Legacy active preserved: 2')
      expect(report).toContain('id=')
      expect(report).toContain('previous=missing')
      expect(report).toContain('next=active')
      expect(report).toContain('activePolicy=preserve')

      const applied = await backfillUserSituation({ cleanupLegacyActive: true })

      expect(applied).toMatchObject({
        dryRun: false,
        matchedCount: 2,
        modifiedCount: 2,
        wouldModifyCount: 2,
        cleanupAppliedCount: 2,
        legacyActivePreservedCount: 0,
      })
      expect(await UserModel.collection.find({}, { projection: { _id: 0, registration: 1, situation: 1, active: 1 } }).sort({ registration: 1 }).toArray()).toEqual([
        { registration: '8', situation: 'active' },
        { registration: '9', situation: 'inactive' },
      ])
    } finally {
      await rm(reportDir, { recursive: true, force: true })
    }
  })
})
