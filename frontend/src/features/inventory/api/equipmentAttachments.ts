import { allowedMimeTypes, EQUIPMENT_ATTACHMENT_RULES, isAllowedAttachmentFile } from '../../../shared/api/attachmentValidation'

export const MAX_EQUIPMENT_ATTACHMENTS = 5
export const MAX_EQUIPMENT_ATTACHMENT_BYTES = 15 * 1024 * 1024
export const EQUIPMENT_ATTACHMENT_TYPES = allowedMimeTypes(EQUIPMENT_ATTACHMENT_RULES)

export type EquipmentDocumentMetadata = { id: string; name: string; type: string; size: number; addedAt: string; status: 'active' }

export function validateEquipmentAttachments(files: File[]) {
  if (files.length > MAX_EQUIPMENT_ATTACHMENTS) throw new Error('Você pode anexar no máximo 5 arquivos.')
  for (const file of files) {
    if (!isAllowedAttachmentFile(file, EQUIPMENT_ATTACHMENT_RULES)) throw new Error('Formato não permitido. Use PDF, JPG ou PNG.')
    if (file.size > MAX_EQUIPMENT_ATTACHMENT_BYTES) throw new Error('Cada arquivo deve ter no máximo 15 MB.')
  }
  return files
}

export function toEquipmentDocumentMetadata(file: File, index: number): EquipmentDocumentMetadata {
  return { id: `local-document-${Date.now()}-${index}`, name: file.name, type: file.type, size: file.size, addedAt: new Date().toISOString(), status: 'active' }
}
