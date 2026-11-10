import { dynamic } from '@solidjs/web';
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
    >
      {icons[props.name].map(([tag, attrs]) => {
        const Shape = dynamic(() => tag);
        return <Shape {...attrs} />;
      })}
    </svg>
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
