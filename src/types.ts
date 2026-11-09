export type Role = 'admin' | 'member'
export type Recurrence = 'recurring' | 'one_off'
export type Tab = 'list' | 'shop' | 'stores' | 'group' | 'ideas' | 'guide' | 'admin'

export interface Profile {
  id: string
  email: string
  display_name: string | null
  marketing_opt_in?: boolean
  notify_new?: boolean
}

export interface Store {
  id: string
  group_id: string
  name: string
  color: string
  sort: number
  logo: string | null
  note?: string | null
  active?: boolean
}

export interface Item {
  id: string
  group_id: string
  name: string
  category: string
  recurrence: Recurrence
  hidden: boolean
  archived: boolean
  default_store_id: string | null
  sort?: number
  created_by?: string | null
}

export interface Need {
  id: string
  group_id: string
  item_id: string
  status: 'missing' | 'bought'
  store_id: string | null
  note: string | null
  quantity?: string | null
  requested_by: string | null
  requested_at: string
  bought_at?: string | null
}

export interface Suggestion {
  id: string
  group_id: string
  name: string
  category: string
  recurrence: Recurrence
  note: string | null
  store_id: string | null
  kind?: 'item' | 'store'
  color?: string | null
  suggested_by: string | null
  status: 'pending' | 'approved' | 'rejected'
  created_at: string
}

export interface Invitation {
  id: string
  group_id: string
  email: string
  role: Role
  created_at: string
}

export interface Member {
  user_id: string
  role: Role
  profile: Profile | null
}

export interface GroupRef {
  id: string
  name: string
  role: Role
}
