import { describe, it, expect } from 'vitest'

const { getDocumentIcon } = await import('../../../../app/composables/index.js')

describe('getDocumentIcon', () => {
  describe('mime passed directly (BL-814: pptx/xlsx/docx showed as TXT)', () => {
    it('maps pptx mime to the ppt icon in PowerPoint red', () => {
      expect(getDocumentIcon('', 'application/vnd.openxmlformats-officedocument.presentationml.presentation'))
        .toEqual({ name: 'document-file-ppt', color: '#D24726', label: 'PowerPoint Presentation' })
    })

    it('maps xlsx mime to the xlsx icon in Excel green', () => {
      expect(getDocumentIcon('', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'))
        .toEqual({ name: 'document-file-xlsx', color: '#217346', label: 'Excel Spreadsheet' })
    })

    it('maps docx mime to the docx icon in Word blue', () => {
      expect(getDocumentIcon('', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'))
        .toEqual({ name: 'document-file-docx', color: '#2B579A', label: 'Word Document' })
    })

    it('maps legacy ppt mime (powerpoint) to the ppt icon', () => {
      expect(getDocumentIcon('', 'application/vnd.ms-powerpoint').name).toBe('document-file-ppt')
    })

    it('maps legacy xls mime (excel) to the xlsx icon', () => {
      expect(getDocumentIcon('', 'application/vnd.ms-excel').name).toBe('document-file-xlsx')
    })

    it('maps legacy doc mime (msword) to the docx icon', () => {
      expect(getDocumentIcon('', 'application/msword').name).toBe('document-file-docx')
    })

    it('maps pdf mime to the pdf icon in Adobe red', () => {
      expect(getDocumentIcon('', 'application/pdf')).toEqual({ name: 'document-file-pdf', color: '#f40f02', label: 'PDF Document' })
    })

    it('maps zip mime to the zip icon', () => {
      expect(getDocumentIcon('', 'application/zip').name).toBe('document-file-zip')
    })

    it('maps image mime to the image icon', () => {
      expect(getDocumentIcon('', 'image/png').name).toBe('file-image-o')
    })

    it('is case-insensitive', () => {
      expect(getDocumentIcon('', 'APPLICATION/PDF').name).toBe('document-file-pdf')
    })
  })

  describe('uri extension fallback when no mime is available', () => {
    it.each([
      ['/sites/default/files/test%20document.pptx', 'document-file-ppt'],
      ['/sites/default/files/test%20document.xlsx', 'document-file-xlsx'],
      ['/sites/default/files/test%20document.docx', 'document-file-docx'],
      ['/sites/default/files/test.pdf',             'document-file-pdf'],
      ['/sites/default/files/photo.jpg',            'file-image-o']
    ])('maps %s to %s', (uri, name) => {
      expect(getDocumentIcon(uri).name).toBe(name)
    })

    it('prefers the passed mime over the uri extension', () => {
      expect(getDocumentIcon('/files/misnamed.txt', 'application/pdf').name).toBe('document-file-pdf')
    })
  })

  describe('human-friendly labels', () => {
    it.each([
      ['image/jpeg',  'JPEG Image'],
      ['image/png',   'PNG Image'],
      ['image/svg+xml', 'SVG Image'],
      ['image/heic',  'HEIC Image'],
      ['image/x-icon', 'ICO Image'],
      ['image/vnd.microsoft.icon', 'ICO Image'],
      ['text/plain',  'Text Document'],
      ['text/csv',    'CSV File'],
      ['text/html',   'HTML Document'],
      ['application/json', 'JSON File'],
      ['application/xml',  'XML File'],
      ['application/zip', 'ZIP Archive'],
      ['application/vnd.rar', 'RAR Archive'],
      ['application/x-rar-compressed', 'RAR Archive'],
      ['application/rtf', 'RTF Document']
    ])('labels %s as %s', (mime, label) => {
      expect(getDocumentIcon('', mime).label).toBe(label)
    })

    it.each([
      ['application/vnd.oasis.opendocument.text',         'document-file-doc', 'ODT Document'],
      ['application/vnd.oasis.opendocument.spreadsheet',  'document-file-xls', 'ODS Spreadsheet'],
      ['application/vnd.oasis.opendocument.presentation', 'document-file-ppt', 'ODP Presentation']
    ])('maps OpenDocument mime %s to %s / %s', (mime, name, label) => {
      expect(getDocumentIcon('', mime)).toMatchObject({ name, label })
    })

    it('maps OpenDocument extensions via uri fallback', () => {
      expect(getDocumentIcon('/files/report.odt').label).toBe('ODT Document')
      expect(getDocumentIcon('/files/data.ods').label).toBe('ODS Spreadsheet')
    })
  })

  describe('fallback', () => {
    it('returns the txt icon with no label for unknown mimes', () => {
      expect(getDocumentIcon('', 'application/octet-stream')).toEqual({ name: 'document-file-txt', color: '#222222', label: '' })
    })

    it('returns the txt icon when neither mime nor extension resolve', () => {
      expect(getDocumentIcon('')).toEqual({ name: 'document-file-txt', color: '#222222', label: '' })
      expect(getDocumentIcon(undefined)).toEqual({ name: 'document-file-txt', color: '#222222', label: '' })
    })
  })
})
