import { useMemo } from 'react';
import QRCode from 'qrcode';

interface QrCodeSvgProps {
  value: string;
  size?: number;
  label?: string;
}

export function QrCodeSvg({ value, size = 192, label = 'Wallet QR Code' }: QrCodeSvgProps) {
  const matrix = useMemo(() => {
    const qr = QRCode.create(value || 'democoin:empty', {
      errorCorrectionLevel: 'M',
    });
    const moduleCount = qr.modules.size;
    const cells: { x: number; y: number }[] = [];
    for (let y = 0; y < moduleCount; y++) {
      for (let x = 0; x < moduleCount; x++) {
        if (qr.modules.get(y, x)) {
          cells.push({ x, y });
        }
      }
    }
    return { moduleCount, cells };
  }, [value]);

  const quietZone = 2;
  const viewBoxSize = matrix.moduleCount + quietZone * 2;

  return (
    <svg
      width={size}
      height={size}
      viewBox={`0 0 ${viewBoxSize} ${viewBoxSize}`}
      role="img"
      aria-label={label}
      className="rounded-lg bg-white border border-slate-200 p-2"
    >
      <rect width={viewBoxSize} height={viewBoxSize} fill="#FFFFFF" />
      {matrix.cells.map((cell) => (
        <rect
          key={`${cell.x}-${cell.y}`}
          x={cell.x + quietZone}
          y={cell.y + quietZone}
          width={1}
          height={1}
          fill="#0F172A"
        />
      ))}
    </svg>
  );
}
