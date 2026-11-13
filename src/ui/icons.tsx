// The same Font Awesome 5 icons the original Better Trading used, drawn inline.
import {faGithub} from '@fortawesome/free-brands-svg-icons';
import {
  faAngleLeft, faAngleRight, faArchive, faCheck, faCheckCircle, faChevronDown, faClipboard, faCog, faCompressAlt,
  faEllipsisH, faExclamationCircle, faFileExport, faFileImport, faFolderOpen, faFolderPlus, faHistory, faInfoCircle,
  faPlusSquare, faSave, faSort, faThumbtack, faTimes, faTrashAlt, faUndo, faUserPlus,
} from '@fortawesome/free-solid-svg-icons';

const ICONS = {
  'angle-left': faAngleLeft, 'angle-right': faAngleRight, archive: faArchive, check: faCheck,
  'check-circle': faCheckCircle, 'chevron-down': faChevronDown, clipboard: faClipboard, cog: faCog,
  'compress-alt': faCompressAlt, 'ellipsis-h': faEllipsisH, 'exclamation-circle': faExclamationCircle,
  'file-export': faFileExport, 'file-import': faFileImport, 'folder-open': faFolderOpen, 'folder-plus': faFolderPlus,
  github: faGithub, history: faHistory, 'info-circle': faInfoCircle, 'plus-square': faPlusSquare, save: faSave,
  sort: faSort, thumbtack: faThumbtack, times: faTimes, 'trash-alt': faTrashAlt, undo: faUndo, 'user-plus': faUserPlus,
};

export type IconName = keyof typeof ICONS;

export function FaIcon(props: {icon: IconName; class?: string; fixedWidth?: boolean}) {
  const [width, height, , , path] = ICONS[props.icon].icon;
  const widthEm = props.fixedWidth ? 1.25 : Math.ceil((width / height) * 16) * 0.0625;

  return (
    <svg
      class={`bt-fa ${props.class || ''}`}
      style={{width: `${widthEm}em`}}
      aria-hidden="true"
      focusable="false"
      role="img"
      xmlns="http://www.w3.org/2000/svg"
      viewBox={`0 0 ${width} ${height}`}
    >
      <path fill="currentColor" d={path as string} />
    </svg>
  );
}
