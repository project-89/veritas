'use client';

import { useCallback, useState } from 'react';

export interface NervTableColumn<T> {
  key: string;
  label: string;
  width?: string;
  render?: (value: unknown, row: T) => React.ReactNode;
  sortable?: boolean;
}

export interface NervTableProps<T> {
  columns: NervTableColumn<T>[];
  data: T[];
  onRowClick?: (row: T) => void;
  selectedId?: string;
  getRowId: (row: T) => string;
  compact?: boolean;
}

type SortDir = 'asc' | 'desc';

function getNestedValue(obj: unknown, path: string): unknown {
  return path.split('.').reduce((acc: unknown, key) => {
    if (acc && typeof acc === 'object') return (acc as Record<string, unknown>)[key];
    return undefined;
  }, obj);
}

export function NervTable<T>({
  columns,
  data,
  onRowClick,
  selectedId,
  getRowId,
  compact = false,
}: NervTableProps<T>) {
  const [sortKey, setSortKey] = useState<string | null>(null);
  const [sortDir, setSortDir] = useState<SortDir>('asc');

  const handleSort = useCallback(
    (key: string) => {
      if (sortKey === key) {
        setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
      } else {
        setSortKey(key);
        setSortDir('asc');
      }
    },
    [sortKey],
  );

  const sortedData = sortKey
    ? [...data].sort((a, b) => {
        const aVal = getNestedValue(a, sortKey);
        const bVal = getNestedValue(b, sortKey);
        const cmp =
          typeof aVal === 'number' && typeof bVal === 'number'
            ? aVal - bVal
            : String(aVal ?? '').localeCompare(String(bVal ?? ''));
        return sortDir === 'asc' ? cmp : -cmp;
      })
    : data;

  const rowHeight = compact ? 'h-7' : 'h-9';

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-xs font-mono">
        <thead>
          <tr className="border-b border-nerv-border">
            {columns.map((col) => (
              <th
                key={col.key}
                style={col.width ? { width: col.width } : undefined}
                className={[
                  'px-3 py-1.5 text-left text-[12px] uppercase tracking-widest text-nerv-text-muted font-normal',
                  col.sortable ? 'cursor-pointer hover:text-nerv-text-secondary select-none' : '',
                ].join(' ')}
                onClick={col.sortable ? () => handleSort(col.key) : undefined}
              >
                <span className="inline-flex items-center gap-1">
                  {col.label}
                  {col.sortable && sortKey === col.key && (
                    <span className="text-nerv-orange">
                      {sortDir === 'asc' ? '\u25B2' : '\u25BC'}
                    </span>
                  )}
                </span>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {sortedData.map((row, i) => {
            const id = getRowId(row);
            const isSelected = id === selectedId;
            return (
              <tr
                key={id}
                onClick={onRowClick ? () => onRowClick(row) : undefined}
                className={[
                  rowHeight,
                  'border-b border-nerv-border/50 transition-colors',
                  i % 2 === 0 ? 'bg-transparent' : 'bg-nerv-bg-panel/30',
                  isSelected ? 'bg-nerv-orange/10 border-l-2 border-l-nerv-orange' : '',
                  onRowClick ? 'cursor-pointer hover:bg-nerv-bg-elevated/60' : '',
                ].join(' ')}
              >
                {columns.map((col) => {
                  const val = getNestedValue(row, col.key);
                  return (
                    <td
                      key={col.key}
                      className="px-3 py-1 text-nerv-text tabular-nums truncate max-w-[200px]"
                    >
                      {col.render ? col.render(val, row) : String(val ?? '')}
                    </td>
                  );
                })}
              </tr>
            );
          })}
          {sortedData.length === 0 && (
            <tr>
              <td colSpan={columns.length} className="px-3 py-6 text-center text-nerv-text-muted">
                NO DATA
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
