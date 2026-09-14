import JSZip from 'jszip';
import WordExtractor from 'word-extractor';

const decode = (value: string) => value.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'");
/** A bounded text preview of the first worksheet; CSV remains the preferred bulk-register format. */
export async function extractXlsxText(data: Buffer): Promise<string> {
  const zip = await JSZip.loadAsync(data);
  const sharedXml = await zip.file('xl/sharedStrings.xml')?.async('string') || '';
  const shared = [...sharedXml.matchAll(/<si\b[^>]*>([\s\S]*?)<\/si>/g)].map(match => decode([...match[1].matchAll(/<t\b[^>]*>([\s\S]*?)<\/t>/g)].map(part => part[1]).join('')));
  const sheet = await zip.file('xl/worksheets/sheet1.xml')?.async('string') || '';
  const rows = [...sheet.matchAll(/<row\b[^>]*>([\s\S]*?)<\/row>/g)].slice(0, 500).map(row => [...row[1].matchAll(/<c\b([^>]*)>([\s\S]*?)<\/c>/g)].map(cell => { const value = cell[2].match(/<v>([\s\S]*?)<\/v>/)?.[1] || cell[2].match(/<t\b[^>]*>([\s\S]*?)<\/t>/)?.[1] || ''; return cell[1].includes('t="s"') ? shared[Number(value)] || '' : decode(value); }).join(' | '));
  if (!rows.length) throw new Error('Spreadsheet has no readable rows.');
  return rows.join('\n').slice(0, 50000);
}

export async function extractOfficeText(data: Buffer, mimeType: string): Promise<string | undefined> {
  if (mimeType === 'text/csv' || mimeType === 'text/plain') return data.toString('utf8').slice(0, 50000);
  if (mimeType === 'application/msword') {
    const extracted = await new WordExtractor().extract(data);
    return [extracted.getBody(), extracted.getFootnotes(), extracted.getEndnotes(), extracted.getHeaders(), extracted.getFooters(), extracted.getTextboxes()].filter(Boolean).join('\n\n').slice(0, 50000);
  }
  if (mimeType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') {
    const mammoth = await import('mammoth');
    return (await mammoth.extractRawText({ buffer: data })).value.slice(0, 50000);
  }
  if (mimeType === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet') return extractXlsxText(data);
  return undefined;
}
