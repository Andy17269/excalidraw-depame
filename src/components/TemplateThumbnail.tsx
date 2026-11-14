import { memo } from 'react';
import type { UiTemplate } from '../services/uiTemplates';

export const TemplateThumbnail = memo(function TemplateThumbnail({ template }: { template: UiTemplate }) {
  const strokeUnit = Math.max(1.5, Math.round(template.width / 180));

  return (
    <svg
      className="library-thumb-svg"
      viewBox={`-4 -4 ${template.width + 8} ${template.height + 8}`}
      preserveAspectRatio="xMidYMid meet"
      aria-hidden="true"
    >
      {template.elements.map((el, index) => {
        if (el.type === 'rectangle') {
          const rx = el.roundness ? Math.min(18, Math.round(Math.min(el.width, el.height) * 0.16)) : 0;
          const fill = el.backgroundColor === 'transparent' ? 'none' : (el.backgroundColor ?? '#ffffff');
          const stroke = el.strokeColor === 'transparent' ? 'none' : (el.strokeColor ?? '#94a3b8');
          const labelBarWidth = el.label
            ? Math.min(el.width * 0.62, Math.max(18, el.label.text.length * (el.label.fontSize ?? 13) * 0.72))
            : 0;
          const labelBarHeight = Math.max(4, Math.round((el.label?.fontSize ?? 13) * 0.55));
          return (
            <g key={index} opacity={el.opacity !== undefined ? el.opacity / 100 : 1}>
              <rect
                x={el.x}
                y={el.y}
                width={Math.max(1, el.width)}
                height={Math.max(1, el.height)}
                rx={rx}
                fill={fill}
                stroke={stroke}
                strokeWidth={(el.strokeWidth ?? 1) * strokeUnit}
              />
              {el.label && el.width >= 36 && el.height >= 20 && (
                <rect
                  x={el.x + (el.width - labelBarWidth) / 2}
                  y={el.y + (el.height - labelBarHeight) / 2}
                  width={labelBarWidth}
                  height={labelBarHeight}
                  rx={labelBarHeight / 2}
                  fill={el.label.strokeColor === '#ffffff' ? 'rgba(255,255,255,0.85)' : (el.label.strokeColor ?? '#64748b')}
                  opacity={el.label.strokeColor === '#ffffff' ? 0.9 : 0.45}
                />
              )}
            </g>
          );
        }

        if (el.type === 'ellipse') {
          const fill = el.backgroundColor === 'transparent' ? 'none' : (el.backgroundColor ?? '#f8fafc');
          const stroke = el.strokeColor === 'transparent' ? 'none' : (el.strokeColor ?? '#94a3b8');
          return (
            <ellipse
              key={index}
              cx={el.x + el.width / 2}
              cy={el.y + el.height / 2}
              rx={Math.max(1, el.width / 2)}
              ry={Math.max(1, el.height / 2)}
              fill={fill}
              stroke={stroke}
              strokeWidth={(el.strokeWidth ?? 1) * strokeUnit}
              opacity={el.opacity !== undefined ? el.opacity / 100 : 1}
            />
          );
        }

        if (el.type === 'line') {
          const [p0, p1] = el.points;
          if (!p0 || !p1) return null;
          return (
            <line
              key={index}
              x1={el.x + p0[0]}
              y1={el.y + p0[1]}
              x2={el.x + p1[0]}
              y2={el.y + p1[1]}
              stroke={el.strokeColor ?? '#cbd5e1'}
              strokeWidth={(el.strokeWidth ?? 1) * strokeUnit}
            />
          );
        }

        const fontSize = el.fontSize ?? 14;
        const barH = Math.max(4, Math.round(fontSize * 0.65));
        const maxW = el.width ?? Math.max(24, template.width - el.x - 16);
        const estW = Math.min(maxW, Math.max(16, el.text.split('\n')[0]!.length * fontSize * 0.72));
        const barX = el.textAlign === 'center' && el.width
          ? el.x + (el.width - estW) / 2
          : el.x;
        const barY = el.verticalAlign === 'middle' && el.height
          ? el.y + (el.height - barH) / 2
          : el.y + Math.max(1, Math.round(fontSize * 0.2));
        return (
          <rect
            key={index}
            x={barX}
            y={barY}
            width={estW}
            height={barH}
            rx={barH / 2}
            fill={el.strokeColor ?? '#1e293b'}
            opacity={fontSize >= 18 ? 0.68 : 0.36}
          />
        );
      })}
    </svg>
  );
});
