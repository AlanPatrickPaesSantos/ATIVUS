export type AttachmentValidationRule = {
  mime: string
  extensions: readonly string[]
}

export const EQUIPMENT_ATTACHMENT_RULES = [
  { mime: 'application/pdf', extensions: ['.pdf'] },
  { mime: 'image/jpeg', extensions: ['.jpg', '.jpeg'] },
  { mime: 'image/png', extensions: ['.png'] },
] as const satisfies readonly AttachmentValidationRule[]

export const CALL_ATTACHMENT_RULES = [
  { mime: 'image/jpeg', extensions: ['.jpg', '.jpeg'] },
  { mime: 'image/png', extensions: ['.png'] },
  { mime: 'image/webp', extensions: ['.webp'] },
  { mime: 'image/gif', extensions: ['.gif'] },
  { mime: 'application/pdf', extensions: ['.pdf'] },
  { mime: 'application/msword', extensions: ['.doc'] },
  { mime: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', extensions: ['.docx'] },
] as const satisfies readonly AttachmentValidationRule[]

export function allowedMimeTypes(rules: readonly AttachmentValidationRule[]) {
  return rules.map((rule) => rule.mime)
}

function extensionFor(fileName: string) {
  const dotIndex = fileName.lastIndexOf('.')
  return dotIndex >= 0 ? fileName.slice(dotIndex).toLocaleLowerCase() : ''
}

export function isAllowedAttachmentFile(file: File, rules: readonly AttachmentValidationRule[]) {
  const extension = extensionFor(file.name)
  return rules.some((rule) => rule.mime === file.type && rule.extensions.includes(extension))
}
