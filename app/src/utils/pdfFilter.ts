import * as pdfjsLib from 'pdfjs-dist';
import pdfjsWorker from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import type { TextItem } from 'pdfjs-dist/types/src/display/api';

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfjsWorker;

const FINANCIAL_KEYWORDS = [
  'commitment', 'committed', 'allocation', 'allocated', 'terminated', 'termination',
  'million', 'billion', 'irr', 'tvpi', 'dpi', 'nav', 'aum',
  'infrastructure', 'private equity', 'real estate', 'credit',
  'management fee', 'carry', 'hurdle', 'fund size', 'target return',
  'distribution', 'capital call', 'co-investment', 'co-invest',
  'performance', 'vintage', 'unfunded', 'paid-in', 'net asset',
];

const FINANCIAL_PATTERNS = [
  /\$[\d,.]+/g,
  /€[\d,.]+/g,
  /[\d.]+%/g,
  /[\d.]+x\b/g,
  /\d{1,3}(,\d{3})+/g,
];

interface PageScore {
  pageNum: number;
  score: number;
}

export async function scorePages(pdfData: Uint8Array): Promise<PageScore[]> {
  const doc = await pdfjsLib.getDocument({ data: pdfData }).promise;
  const scores: PageScore[] = [];

  for (let i = 1; i <= doc.numPages; i++) {
    const page = await doc.getPage(i);
    const textContent = await page.getTextContent();
    const text = textContent.items
      .filter((item): item is TextItem => 'str' in item)
      .map((item) => item.str)
      .join(' ')
      .toLowerCase();

    let score = 0;

    for (const keyword of FINANCIAL_KEYWORDS) {
      const matches = text.match(new RegExp(keyword, 'gi'));
      if (matches) score += matches.length;
    }

    for (const pattern of FINANCIAL_PATTERNS) {
      const matches = text.match(new RegExp(pattern));
      if (matches) score += matches.length * 2;
    }

    scores.push({ pageNum: i, score });
  }

  return scores;
}

export function selectTopPages(scores: PageScore[], maxPages: number): number[] {
  return scores
    .filter((p) => p.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, maxPages)
    .sort((a, b) => a.pageNum - b.pageNum)
    .map((p) => p.pageNum);
}
