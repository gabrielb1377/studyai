"use client";

import { useMemo, useState, type ReactNode } from "react";

export function VirtualizedList<T>({ items, itemHeight, height, overscan = 3, getKey, renderItem, ariaLabel }: {
  items: readonly T[];
  itemHeight: number;
  height: number;
  overscan?: number;
  getKey: (item: T) => string;
  renderItem: (item: T, index: number) => ReactNode;
  ariaLabel: string;
}) {
  const [scrollTop, setScrollTop] = useState(0);
  const range = useMemo(() => {
    const start = Math.max(0, Math.floor(scrollTop / itemHeight) - overscan);
    const visible = Math.ceil(height / itemHeight) + overscan * 2;
    return { start, end: Math.min(items.length, start + visible) };
  }, [height, itemHeight, items.length, overscan, scrollTop]);
  return (
    <div role="list" aria-label={ariaLabel} className="relative overflow-y-auto" style={{ height }} onScroll={(event) => setScrollTop(event.currentTarget.scrollTop)}>
      <div style={{ height: items.length * itemHeight }}>
        {items.slice(range.start, range.end).map((item, offset) => {
          const index = range.start + offset;
          return <div role="listitem" key={getKey(item)} className="absolute inset-x-0" style={{ height: itemHeight, transform: `translateY(${index * itemHeight}px)` }}>{renderItem(item, index)}</div>;
        })}
      </div>
    </div>
  );
}
