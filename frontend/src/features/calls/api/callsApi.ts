import { httpClient } from '../../../shared/api/httpClient'
import { allowedMimeTypes, CALL_ATTACHMENT_RULES, isAllowedAttachmentFile } from '../../../shared/api/attachmentValidation'

export type CallProblem = 'software' | 'hardware' | 'printer' | 'network' | 'radio'
export type ResponsibleSection = 'Suporte' | 'Telecom'
export type CallPriority = 'low' | 'medium' | 'high' | 'critical'

export type CallDraft = {
  problem: CallProblem
  priority: CallPriority
  subject: string
  description: string
  equipmentId?: string
  attachments: File[]
}

export type CreatedCall = { id: string; protocol: string }
export type CallQueueItem = { id: string; subject: string; unitId: string; unitName: string; priority: string; status: string; section?: ResponsibleSection; updatedAt?: string }
export type CallsResponse = { items: CallQueueItem[] }
export type CallDetailEquipment = { id: string; patrimony: string; type: string; model: string; brand: string } | null
export type CallHistoryEntry = { id: string; description: string; occurredAt: string }
export type AttachmentMetadata = { id: string; name: string; type: string; size: number; uploadedAt: string; status: 'active'; downloadUrl: string }
export type CallDetails = CallQueueItem & {
  protocol: string
  problem: CallProblem
  description: string
  unit: { id: string; name: string; acronym: string }
  requestedBy: string
  equipment: CallDetailEquipment
  openedAt: string
  attachments: AttachmentMetadata[]
  history: CallHistoryEntry[]
}

export const MAX_ATTACHMENT_SIZE_BYTES = 10 * 1024 * 1024
export const MAX_ATTACHMENT_SIZE_LABEL = '10 MiB'
export const MAX_CALL_ATTACHMENTS = 5
export const allowedAttachmentTypes = allowedMimeTypes(CALL_ATTACHMENT_RULES)

export function validateAttachments(attachments: File[]) {
  if (attachments.length > MAX_CALL_ATTACHMENTS) {
    throw new Error(`Você pode anexar no máximo ${MAX_CALL_ATTACHMENTS} arquivos.`)
  }
  for (const attachment of attachments) {
    if (!isAllowedAttachmentFile(attachment, CALL_ATTACHMENT_RULES)) {
      throw new Error(`Tipo de anexo não permitido: ${attachment.name}. Use documentos PDF/DOC/DOCX ou fotos JPG/PNG/WEBP/GIF.`)
    }
    if (attachment.size > MAX_ATTACHMENT_SIZE_BYTES) {
      throw new Error(`O anexo ${attachment.name} excede o tamanho máximo de ${MAX_ATTACHMENT_SIZE_LABEL}.`)
    }
  }
}

export const problemOptions: Array<{ value: CallProblem; label: string; section: ResponsibleSection }> = [
  { value: 'software', label: 'Sistema ou software', section: 'Suporte' },
  { value: 'hardware', label: 'Computador ou periférico', section: 'Suporte' },
  { value: 'printer', label: 'Impressora', section: 'Suporte' },
  { value: 'network', label: 'Rede ou conectividade', section: 'Telecom' },
  { value: 'radio', label: 'Rádio ou comunicação', section: 'Telecom' },
]

export function sectionForProblem(problem: CallProblem): ResponsibleSection {
  return problemOptions.find((option) => option.value === problem)?.section ?? 'Suporte'
}

const telecomSubjectPattern = /Rádio|Enlace|conectividade/i

export function sectionForCall(call: Pick<CallQueueItem, 'subject' | 'section'>): ResponsibleSection {
  return call.section ?? (telecomSubjectPattern.test(call.subject) ? 'Telecom' : 'Suporte')
}

export function submitCall(draft: CallDraft) {
  validateAttachments(draft.attachments)
  const body = new FormData()
  body.set('problem', draft.problem)
  body.set('priority', draft.priority)
  body.set('subject', draft.subject)
  body.set('description', draft.description)
  if (draft.equipmentId) body.set('equipmentId', draft.equipmentId)
  draft.attachments.forEach((attachment) => body.append('attachments', attachment))
  return httpClient<CreatedCall>('/calls', { method: 'POST', body })
}

export function getCalls() {
  return httpClient<CallsResponse>('/calls')
}
export function getCallDetails(callId: string) {
  return httpClient<CallDetails>(`/calls/${callId}`)
}
export function triageCall(callId: string, input: { status: string; priority: CallPriority; section: ResponsibleSection; updatedAt: string }) { return httpClient<CallQueueItem>(`/calls/${callId}/triage`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(input) }) }
