import {
  ArrowUpRight,
  ArrowRight,
  ArrowLeft,
  X,
  Folder,
  FileText,
  UserRound,
  Clover,
  ChevronRight,
  ChevronLeft,
  Dice5,
  CodeXml,
  Ruler,
  Music,
  BookOpen,
  Grid2x2,
  Check,
  Plus,
  RotateCcw,
  Eraser,
  Stamp,
  Eye,
  EyeOff,
  ChevronDown,
  Play,
  Star,
  LogIn,
  LogOut,
  Move,
  Trash2,
  QrCode,
  Trophy,
  BriefcaseBusiness,
  GraduationCap,
  Sparkles,
} from 'lucide';
const icons = {
  ArrowUpRight,
  ArrowRight,
  ArrowLeft,
  X,
  Folder,
  FileText,
  UserRound,
  Clover,
  ChevronRight,
  ChevronLeft,
  Dice5,
  CodeXml,
  Ruler,
  Music,
  BookOpen,
  Grid2x2,
  Check,
  Plus,
  RotateCcw,
  Eraser,
  Stamp,
  Eye,
  EyeOff,
  ChevronDown,
  Play,
  Star,
  LogIn,
  LogOut,
  Move,
  Trash2,
  QrCode,
  Trophy,
  BriefcaseBusiness,
  GraduationCap,
  Sparkles,
};
export type IconName = keyof typeof icons;
const escapeAttribute = (value: unknown) =>
  String(value).replaceAll('&', '&amp;').replaceAll('"', '&quot;').replaceAll('<', '&lt;');
// Each icon's shapes as markup, built once. The shapes never change, so the page sets them as the
// SVG's innerHTML: hydration keeps the server's shapes as they are (Solid skips innerHTML while
// hydrating) instead of claiming every <path> through a dynamic component, which was the largest
// part of hydrating a page.
const markup = new Map<IconName, string>();
const shapes = (name: IconName) => {
  let html = markup.get(name);
  if (html === undefined) {
    html = icons[name]
      .map(
        ([tag, attrs]) =>
          `<${tag}${Object.entries(attrs)
            .map(([key, value]) => ` ${key}="${escapeAttribute(value)}"`)
            .join('')}/>`,
      )
      .join('');
    markup.set(name, html);
  }
  return html;
};
export default function Icon(props: { name: IconName; size?: number; class?: string; stroke?: number }) {
  // Official Lucide node data; no Solid 1 runtime from a framework wrapper.
  return (
    <svg
      width={props.size ?? 20}
      height={props.size ?? 20}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      stroke-width={props.stroke ?? 1.8}
      stroke-linecap="round"
      stroke-linejoin="round"
      aria-hidden="true"
      class={props.class}
      innerHTML={shapes(props.name)}
    />
  );
}

/**
 * The mark of a history entry's kind, in the ink of the seals: a trophy for an award (vermilion),
 * a briefcase for work (indigo), a mortarboard for school (sumi). One drawing per kind, the same on
 * the home page's note and the profile's history.
 */
const kindIcons = { award: 'Trophy', intern: 'BriefcaseBusiness', school: 'GraduationCap' } as const;
export function KindMark(props: { kind: keyof typeof kindIcons; size?: number }) {
  return (
    <span class="kind-mark" data-kind={props.kind}>
      <Icon name={kindIcons[props.kind]} size={props.size ?? 18} stroke={2} />
    </span>
  );
}
