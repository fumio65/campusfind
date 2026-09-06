import { FileSpreadsheet, Download } from 'lucide-react'
import { TEMPLATE_HEADERS, TEMPLATE_EXAMPLE_ROWS } from './csvTemplate'
import { downloadBulkImportTemplate } from './csvTemplate'

const PREVIEW_COLUMN_COUNT = 4

export default function TemplateCard() {
  const previewHeaders = TEMPLATE_HEADERS.slice(0, PREVIEW_COLUMN_COUNT)
  const hiddenColumnCount = TEMPLATE_HEADERS.length - PREVIEW_COLUMN_COUNT
  const previewRow = TEMPLATE_EXAMPLE_ROWS[0].slice(0, PREVIEW_COLUMN_COUNT)

  return (
    <div className="bg-surface-card border border-border rounded-xl p-5 mb-4 flex items-center gap-5">
      <div className="w-11 h-11 rounded-full bg-status-open-bg text-status-open-text flex items-center justify-center shrink-0">
        <FileSpreadsheet size={20} aria-hidden="true" />
      </div>

      <div className="flex-1 min-w-0">
        <div className="text-sm font-semibold text-text-primary mb-0.5">
          Not sure of the format?
        </div>
        <p className="text-xs text-text-secondary mb-3">
          Download a template with the {TEMPLATE_HEADERS.length} expected columns and a few example rows.
        </p>

        <div className="rounded-lg border border-border overflow-hidden inline-block max-w-full">
          <table className="text-xs">
            <thead>
              <tr className="bg-surface-muted">
                {previewHeaders.map((header) => (
                  <th key={header} className="px-2.5 py-1.5 text-left font-semibold text-text-secondary whitespace-nowrap">
                    {header}
                  </th>
                ))}
                {hiddenColumnCount > 0 && (
                  <th className="px-2.5 py-1.5 text-left font-medium text-text-muted whitespace-nowrap">
                    +{hiddenColumnCount} more
                  </th>
                )}
              </tr>
            </thead>
            <tbody>
              <tr>
                {previewRow.map((value, i) => (
                  <td key={i} className="px-2.5 py-1.5 text-text-secondary whitespace-nowrap border-t border-border">
                    {value}
                  </td>
                ))}
                {hiddenColumnCount > 0 && (
                  <td className="px-2.5 py-1.5 text-text-muted border-t border-border">&hellip;</td>
                )}
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <button
        type="button"
        onClick={downloadBulkImportTemplate}
        className="shrink-0 inline-flex items-center gap-2 px-4 py-2.5 text-sm font-medium rounded-md bg-brand-600 text-white hover:bg-brand-700 transition-colors"
      >
        <Download size={15} aria-hidden="true" />
        Download template
      </button>
    </div>
  )
}