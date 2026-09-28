import { dynamic } from '@solidjs/web';
import {
  ArrowUpRight,
  ArrowRight,
  ArrowLeft,
  SunMoon,
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
} from 'lucide';
const icons = {
  ArrowUpRight,
  ArrowRight,
  ArrowLeft,
  SunMoon,
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
};
export type IconName = keyof typeof icons;
export default function Icon(props: { name: IconName; size?: number; class?: string }) {
  // Official Lucide node data; no Solid 1 runtime from a framework wrapper.
  return (
    <svg
      width={props.size ?? 20}
      height={props.size ?? 20}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      stroke-width="1.7"
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
