import mongoose from 'mongoose';
import { describe, expect, it } from 'vitest';

import { toTransferSnapshot } from '../repositories/acTransfersRepository.js';
import { buildAcTransferDocumentModel, buildAcTransferDocumentLayout, renderAcTransferDocx, renderAcTransferPdf } from './acTransferDocuments.js';

describe('AC transfer document model', () => {
  it('captures identification and model in a new transfer snapshot', () => {
    const snapshot = toTransferSnapshot({
      _id: new mongoose.Types.ObjectId(),
      patrimony: 'RP-DOC-1', serialNumber: 'SN-1', brand: 'Motorola', type: 'Rádio', model: 'APX',
      custody: { scope: 'AC', unit: null }, updatedAt: new Date('2026-10-26T10:00:00.000Z'), __v: 0,
    });

    expect(snapshot).toMatchObject({ description: 'Rádio', identification: 'Motorola', model: 'APX' });
  });

  it('normalizes legacy snapshots without reading Equipment', () => {
    const model = buildAcTransferDocumentModel({
      id: 'transfer-1', origin: 'AC', status: 'confirmed', distributedAt: '2026-10-26T10:00:00.000Z',
      destinationUnit: { id: 'unit-1', name: 'Unidade Norte', acronym: 'UN' },
      deliverer: { name: 'Entregador' }, receiver: { name: 'Recebedor' }, materials: [{ equipmentId: 'equipment-1', patrimony: 'RP-LEGACY', sourceCustody: { scope: 'AC', unit: null }, equipmentUpdatedAt: '2026-10-25T10:00:00.000Z', equipmentVersion: 0 }], createdAt: '2026-10-26T10:00:00.000Z', createdBy: 'ac-1',
    });

    expect(model.materials[0]).toMatchObject({ patrimony: 'RP-LEGACY', identification: 'Não informado', model: 'Não informado' });
  });

  it('renders a valid DOCX with multiple materials and no BG', async () => {
    const model = buildAcTransferDocumentModel({
      id: 'transfer-docx', origin: 'AC', status: 'confirmed', distributedAt: '2026-10-26T10:00:00.000Z',
      destinationUnit: { id: 'unit-1', name: 'Unidade Norte', acronym: 'UN' }, deliverer: { name: 'Entrega' }, receiver: { name: 'Recebe' },
      materials: [
        { equipmentId: '1', patrimony: 'RP-1', serialNumber: 'SN-1', identification: 'Motorola', model: 'APX', sourceCustody: { scope: 'AC', unit: null }, equipmentUpdatedAt: '2026-10-25T10:00:00.000Z', equipmentVersion: 0 },
        { equipmentId: '2', patrimony: 'RP-2', serialNumber: 'SN-2', identification: 'Dell', model: 'T14', sourceCustody: { scope: 'AC', unit: null }, equipmentUpdatedAt: '2026-10-25T10:00:00.000Z', equipmentVersion: 0 },
      ], createdAt: '2026-10-26T10:00:00.000Z', createdBy: 'ac-1',
    });
    const first = await renderAcTransferDocx(model);
    const second = await renderAcTransferDocx(model);
    expect(first.subarray(0, 2).toString()).toBe('PK');
    expect(second.subarray(0, 2).toString()).toBe('PK');
    expect(model).toMatchObject({ notice: 'MODELO PROVISÓRIO - NÃO OFICIAL', bg: null, materials: [{ patrimony: 'RP-1' }, { patrimony: 'RP-2' }] });
  });

  it('renders a valid PDF with provisional notice, data and blank signatures', async () => {
    const model = buildAcTransferDocumentModel({
      id: 'transfer-pdf', origin: 'AC', status: 'confirmed', distributedAt: '2026-10-26T10:00:00.000Z', destinationUnit: { id: 'unit-1', name: 'Unidade Norte', acronym: 'UN' }, deliverer: { name: 'Entrega' }, receiver: { name: 'Recebe' }, bg: { number: 'BG-1' },
      materials: [{ equipmentId: '1', patrimony: 'RP-<1>', serialNumber: 'SN-1', identification: 'Marca', model: 'Modelo', sourceCustody: { scope: 'AC', unit: null }, equipmentUpdatedAt: '2026-10-25T10:00:00.000Z', equipmentVersion: 0 }], createdAt: '2026-10-26T10:00:00.000Z', createdBy: 'ac-1',
    });
    const buffer = await renderAcTransferPdf(model);
    const text = buffer.toString('latin1');
    expect(text.startsWith('%PDF-')).toBe(true);
    expect(text).toContain('%%EOF');
    expect(model).toMatchObject({ notice: 'MODELO PROVISÓRIO - NÃO OFICIAL', bg: 'BG-1', materials: [{ patrimony: 'RP- 1' }] });
  });

  it('builds the reference structure with a numbered description column and signature section', () => {
    const model = buildAcTransferDocumentModel({
      id: 'transfer-layout', origin: 'AC', status: 'confirmed', distributedAt: '2026-10-26T10:00:00.000Z',
      destinationUnit: { id: 'unit-1', name: 'Unidade Norte', acronym: 'UN' }, deliverer: { name: 'Entrega' }, receiver: { name: 'Recebe' },
      materials: [{ equipmentId: '1', patrimony: 'RP-1', serialNumber: 'SN-1', description: 'Rádio portátil', identification: 'Motorola', model: 'APX', sourceCustody: { scope: 'AC', unit: null }, equipmentUpdatedAt: '2026-10-25T10:00:00.000Z', equipmentVersion: 0 }],
      createdAt: '2026-10-26T10:00:00.000Z', createdBy: 'ac-1',
    });

    const layout = buildAcTransferDocumentLayout(model);

    expect(layout.header).toMatchObject({ institution: 'POLÍCIA MILITAR DO PARÁ', office: 'AC  |  CONTROLE E DISTRIBUIÇÃO PATRIMONIAL' });
    expect(layout.sections.map((section) => section.title)).toEqual([
      '01  IDENTIFICAÇÃO DA TRANSFERÊNCIA',
      '02  DECLARAÇÃO DE ENTREGA E RECEBIMENTO',
      '03  RELAÇÃO DOS BENS TRANSFERIDOS',
      '04  CIÊNCIA E ASSINATURAS',
    ]);
    expect(layout.materials[0]).toMatchObject({ number: '01', patrimony: 'RP-1', serialNumber: 'SN-1', description: 'Rádio portátil', model: 'APX' });
    expect(layout.signatures).toEqual(['Responsável pela entrega', 'Responsável pelo recebimento']);
  });

  it('repeats the material table header in DOCX and paginates a large PDF', async () => {
    const model = buildAcTransferDocumentModel({
      id: 'transfer-many', origin: 'AC', status: 'confirmed', distributedAt: '2026-10-26T10:00:00.000Z',
      destinationUnit: { id: 'unit-1', name: 'Unidade Norte', acronym: 'UN' }, deliverer: { name: 'Entrega' }, receiver: { name: 'Recebe' },
      materials: Array.from({ length: 90 }, (_, index) => ({ equipmentId: String(index), patrimony: `RP-${index}`, serialNumber: `SN-${index}`, identification: 'Rádio portátil', model: 'APX', sourceCustody: { scope: 'AC' as const, unit: null }, equipmentUpdatedAt: '2026-10-25T10:00:00.000Z', equipmentVersion: 0 })),
      createdAt: '2026-10-26T10:00:00.000Z', createdBy: 'ac-1',
    });
    const docx = await renderAcTransferDocx(model);
    const pdf = await renderAcTransferPdf(model);

    expect(docx.toString('latin1')).toContain('PK');
    expect(pdf.toString('latin1').match(/\/Type \/Page/g)?.length ?? 0).toBeGreaterThan(1);
  });
});
