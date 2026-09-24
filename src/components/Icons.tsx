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

/** Энергия занятий: подвигаться — молния, поиграть — кубики, спокойно — луна. */
export function IconBolt(props: IconProps) {
  return <Svg {...props}><path d="M13 3 5.5 13.5H12l-1 7.5 7.5-10.5H12z" /></Svg>;
}

/** Кубики с картинками — «поиграть»: их узнаёт каждая мама. */
export function IconBlocks(props: IconProps) {
  return (
    <Svg {...props}>
      <rect x="3.5" y="12.5" width="8" height="8" rx="1.6" />
      <rect x="12.5" y="12.5" width="8" height="8" rx="1.6" />
      <rect x="8" y="3.5" width="8" height="8" rx="1.6" />
      <circle cx="7.5" cy="16.5" r="1.6" />
      <path d="m14.6 18.4 1.9-3.4 1.9 3.4z" />
      <path d="M10.6 7.5h2.8M12 6.1v2.8" />
    </Svg>
  );
}

/** Мишка — раздел «Чем заняться»: игры и игрушки, а не абстрактная искра. */
export function IconToy(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M6.06 9.5a2.9 2.9 0 1 1 3.03-2.67M14.91 6.83a2.9 2.9 0 1 1 3.03 2.67" />
      <circle cx="12" cy="13.2" r="7" />
      <ellipse cx="12" cy="16" rx="2.9" ry="2.2" />
      <path d="M11.2 15.3h1.6" strokeWidth={2.2} />
      <path d="M9.3 11.6h.01M14.7 11.6h.01" strokeWidth={2.6} />
    </Svg>
  );
}

export function IconBottle(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M10 2.8h4M10.5 2.8v2.4L9 7.4v11.2A2.4 2.4 0 0 0 11.4 21h1.2a2.4 2.4 0 0 0 2.4-2.4V7.4l-1.5-2.2V2.8" />
      <path d="M9 11h6M9 14.5h6" />
    </Svg>
  );
}

export function IconHeart(props: IconProps) {
  return <Svg {...props}><path d="M12 19.5s-7-4.3-7-9.4A3.9 3.9 0 0 1 12 8a3.9 3.9 0 0 1 7 2.1c0 5.1-7 9.4-7 9.4z" /></Svg>;
}

export function IconUser(props: IconProps) {
  return (
    <Svg {...props}>
      <circle cx="12" cy="8.5" r="3.5" />
      <path d="M5 19.5c1.2-3.3 3.8-5 7-5s5.8 1.7 7 5" />
    </Svg>
  );
}

export function IconShield(props: IconProps) {
  return <Svg {...props}><path d="M12 3.5 5.5 6v5.3c0 4.2 2.8 7.5 6.5 9.2 3.7-1.7 6.5-5 6.5-9.2V6z" /><path d="m9.3 12 2 2 3.6-3.8" /></Svg>;
}
