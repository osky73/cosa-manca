import type { ReactNode } from 'react'

function Svg({ children, size = 24 }: { children: ReactNode; size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {children}
    </svg>
  )
}

export const IconList = () => (
  <Svg>
    <path d="M9 6h11M9 12h11M9 18h11" />
    <path d="M3.5 6l1 1 2-2M3.5 12l1 1 2-2M3.5 18l1 1 2-2" />
  </Svg>
)
export const IconCart = () => (
  <Svg>
    <circle cx="9" cy="20" r="1.5" />
    <circle cx="18" cy="20" r="1.5" />
    <path d="M2 3h3l2.5 12h11l2-8H6" />
  </Svg>
)
export const IconInbox = () => (
  <Svg>
    <path d="M12 3a6 6 0 0 0-3.5 10.9V16h7v-2.1A6 6 0 0 0 12 3z" />
    <path d="M9.5 19h5M10.5 22h3" />
  </Svg>
)
export const IconUsers = () => (
  <Svg>
    <circle cx="9" cy="8" r="3.5" />
    <path d="M2.5 20a6.5 6.5 0 0 1 13 0" />
    <path d="M16 4.6a3.5 3.5 0 0 1 0 6.8M18 14.2a6.5 6.5 0 0 1 3.5 5.8" />
  </Svg>
)
export const IconSearch = () => (
  <Svg size={20}>
    <circle cx="11" cy="11" r="7" />
    <path d="M20 20l-3.5-3.5" />
  </Svg>
)
export const IconX = () => (
  <Svg size={20}>
    <path d="M6 6l12 12M18 6L6 18" />
  </Svg>
)
export const IconPlus = () => (
  <Svg size={22}>
    <path d="M12 5v14M5 12h14" />
  </Svg>
)
export const IconCheck = () => (
  <Svg size={20}>
    <path d="M5 12.5l4.5 4.5L19 7.5" />
  </Svg>
)
export const IconChevron = ({ open }: { open: boolean }) => (
  <span style={{ display: 'inline-flex', transform: open ? 'rotate(90deg)' : 'none', transition: 'transform .15s' }}>
    <Svg size={20}>
      <path d="M9 6l6 6-6 6" />
    </Svg>
  </span>
)
export const IconShare = () => (
  <Svg size={20}>
    <path d="M12 3v12M8 7l4-4 4 4" />
    <path d="M5 12v7a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-7" />
  </Svg>
)
export const IconTrash = () => (
  <Svg size={20}>
    <path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3" />
  </Svg>
)
export const IconEye = () => (
  <Svg size={20}>
    <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z" />
    <circle cx="12" cy="12" r="3" />
  </Svg>
)
export const IconEyeOff = () => (
  <Svg size={20}>
    <path d="M3 3l18 18M10.6 5.1A9.7 9.7 0 0 1 12 5c6.5 0 10 7 10 7a17 17 0 0 1-3.2 4M6.5 6.6A16.6 16.6 0 0 0 2 12s3.5 7 10 7a9.8 9.8 0 0 0 4-.9" />
    <path d="M9.9 9.9a3 3 0 0 0 4.2 4.2" />
  </Svg>
)

export const IconMail = () => (
  <Svg>
    <rect x="3" y="5" width="18" height="14" rx="2" />
    <path d="M3 7l9 6 9-6" />
  </Svg>
)

export function IconStore() {
  return (
    <Svg>
      <path d="M3 9l1.5-5h15L21 9" />
      <path d="M4 9v11h16V9" />
      <path d="M3 9a3 3 0 0 0 6 0 3 3 0 0 0 6 0 3 3 0 0 0 6 0" />
      <path d="M10 20v-5h4v5" />
    </Svg>
  )
}

export const IconMapPin = () => (
  <Svg size={24}>
    <path d="M12 21s7-6.2 7-11.5a7 7 0 1 0-14 0C5 14.8 12 21 12 21z" />
    <circle cx="12" cy="9.5" r="2.5" />
  </Svg>
)
