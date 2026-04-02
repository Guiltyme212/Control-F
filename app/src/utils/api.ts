import type { Metric, ExtractedData } from '../data/types';

const SYSTEM_PROMPT = `You are a financial data extraction agent specialized in US public pension fund documents.

You will receive a PDF document from a public pension fund (board meeting minutes, transaction reports, investment memos, performance reports, IPC reports).

Extract ALL financial metrics into structured JSON. Be thorough — extract every single data point.

Return ONLY valid JSON (no markdown fences, no explanation, no preamble) with this structure:

{
  "document_metadata": {
    "source_organization": "string",
    "document_type": "string",
    "document_date": "YYYY-MM-DD",
    "reporting_period": "string"
  },
  "extracted_metrics": [
    {
      "date": "YYYY-MM-DD",
      "lp_name": "string",
      "fund_name": "string",
      "gp_manager": "string",
      "metric_type": "Commitment | Termination | NAV | IRR | TVPI | DPI | AUM | Management Fee | Carry | Target Fund Size | Target Return | Asset Allocation | Co-Investment | Distribution | Capital Call",
      "value": "string — preserve original format",
      "currency": "USD | EUR | GBP",
      "asset_class": "string",
      "strategy": "string",
      "page_reference": "number or null",
      "evidence_text": "exact sentence from document, max 150 chars",
      "confidence": "high | medium | low"
    }
  ],
  "cross_reference_signals": [
    {
      "signal_type": "string",
      "description": "string"
    }
  ]
}

Rules:
1. Extract EVERY commitment, termination, allocation, performance metric, fee structure
2. Fee structures: separate entries for mgmt fee AND carry
3. Performance: separate entries for IRR, TVPI, DPI per fund
4. Always include evidence_text
5. "No activity" sections: note with value "No activity"
6. Proposed investments: use Commitment but note "proposed" in evidence
7. Co-investments: separate entries from main fund commitments
8. Capture target fund size and target returns`;

function readFileAsBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      // Remove the data URL prefix (data:application/pdf;base64,)
      const base64 = result.split(',')[1];
      resolve(base64);
    };
    reader.onerror = () => reject(new Error('Failed to read file'));
    reader.readAsDataURL(file);
  });
}

export interface ExtractionResult {
  metrics: Metric[];
  signals: { signal_type: string; description: string }[];
  metadata: ExtractedData['document_metadata'];
}

export async function extractMetricsFromPDF(
  file: File,
  apiKey: string
): Promise<ExtractionResult> {
  const base64String = await readFileAsBase64(file);

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
      'anthropic-dangerous-direct-browser-access': 'true',
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 8000,
      system: SYSTEM_PROMPT,
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'document',
              source: {
                type: 'base64',
                media_type: 'application/pdf',
                data: base64String,
              },
            },
            {
              type: 'text',
              text: 'Extract all financial metrics from this document.',
            },
          ],
        },
      ],
    }),
  });

  if (response.status === 401) {
    throw new Error('Invalid API key. Please check your Anthropic API key in settings.');
  }
  if (response.status === 429) {
    throw new Error('Rate limit exceeded. Please wait a moment and try again.');
  }
  if (!response.ok) {
    const errorBody = await response.text().catch(() => '');
    throw new Error(`API error (${response.status}): ${errorBody || response.statusText}`);
  }

  const data = await response.json();

  // Extract the text content from the response
  const textBlock = data.content?.find(
    (block: { type: string }) => block.type === 'text'
  );
  if (!textBlock?.text) {
    throw new Error('No text content in API response');
  }

  let parsed: ExtractedData;
  try {
    // Try to parse directly; also handle markdown-fenced JSON just in case
    let jsonStr = textBlock.text.trim();
    if (jsonStr.startsWith('```')) {
      jsonStr = jsonStr.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '');
    }
    parsed = JSON.parse(jsonStr);
  } catch {
    throw new Error('Failed to parse extraction results. The API returned malformed JSON.');
  }

  // Map API metrics to our Metric type
  const metrics: Metric[] = (parsed.extracted_metrics || []).map((am) => ({
    date: am.date || '',
    lp: am.lp_name || '',
    fund: am.fund_name || '',
    gp: am.gp_manager || '',
    metric: am.metric_type || '',
    value: am.value || '',
    asset_class: am.asset_class || '',
    source: file.name,
    page: am.page_reference ?? 0,
    evidence: am.evidence_text || '',
    confidence: am.confidence || 'medium',
  }));

  return {
    metrics,
    signals: parsed.cross_reference_signals || [],
    metadata: parsed.document_metadata || {
      source_organization: '',
      document_type: '',
      document_date: '',
      reporting_period: '',
    },
  };
}
