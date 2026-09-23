/**
 * Значки приложения — один набор, одна толщина линии, один размер.
 *
 * Раньше стрелки и крестики были буквами шрифта («‹», «✕»): в каждом месте
 * своего размера и веса, а настройки обозначались значком, похожим на солнце.
 * Все значки рисуются цветом текста (currentColor) и потому сами следуют теме.
 */

interface IconProps {
  size?: number;
}

function Svg({ size = 22, children }: IconProps & { children: React.ReactNode }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      {children}
    </svg>
  );
}

export function IconBack(props: IconProps) {
  return <Svg {...props}><path d="M14.5 5.5 8 12l6.5 6.5" /></Svg>;
}

export function IconForward(props: IconProps) {
  return <Svg {...props}><path d="M9.5 5.5 16 12l-6.5 6.5" /></Svg>;
}

export function IconClose(props: IconProps) {
  return <Svg {...props}><path d="M6.5 6.5l11 11M17.5 6.5l-11 11" /></Svg>;
}

/** Шестерёнка: восемь зубцов вокруг кольца — её не спутать с солнцем. */
export function IconSettings(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M10.3 3.2h3.4l.5 2.3 1.6.9 2.2-.8 1.7 2.9-1.8 1.6v1.8l1.8 1.6-1.7 2.9-2.2-.8-1.6.9-.5 2.3h-3.4l-.5-2.3-1.6-.9-2.2.8-1.7-2.9 1.8-1.6v-1.8L4.3 8.5 6 5.6l2.2.8 1.6-.9z" />
      <circle cx="12" cy="12" r="2.8" />
    </Svg>
  );
}

export function IconSun(props: IconProps) {
  return (
    <Svg {...props}>
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2.8v1.9M12 19.3v1.9M2.8 12h1.9M19.3 12h1.9M5.5 5.5l1.35 1.35M17.15 17.15l1.35 1.35M18.5 5.5l-1.35 1.35M6.85 17.15 5.5 18.5" />
    </Svg>
  );
}

export function IconMoon(props: IconProps) {
  return <Svg {...props}><path d="M19.5 14.6A8 8 0 0 1 9.4 4.5a8 8 0 1 0 10.1 10.1z" /></Svg>;
}
