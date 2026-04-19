import {
  BookOpen, Link, ClipboardCheck, Rocket, Users, Target,
  TrendingUp, CheckCircle, Phone, Package, BarChart3,
  UserPlus, Crown, Network, Mail, ChevronDown, ArrowRight,
  ExternalLink, UserCheck, Headset,
  Hash, Heart, Award, ShieldCheck, Crosshair, Star,
  Medal, BadgeCheck, Watch, Gem, Zap,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'

export const GROUP_ICONS: Record<string, LucideIcon> = {
  BookOpen, Link, ClipboardCheck, Rocket, Users, Target,
  TrendingUp, CheckCircle, Phone, Package, BarChart3,
  UserPlus, Crown, Network,
}

export const PROGRESSION_ICONS: Record<string, LucideIcon> = {
  code_number: Hash,
  client: Heart,
  pass_license: Award,
  business_partner_plan: ClipboardCheck,
  licensed_appointed: ShieldCheck,
  '10_field_trainings': Crosshair,
  associate_promotion: Star,
  net_license: Zap,
  cft_in_progress: BookOpen,
  certified_field_trainer: BadgeCheck,
  elite_trainer: Medal,
  marketing_director: Crown,
  '50k_watch': Watch,
  '100k_ring': Gem,
  emd: Crown,
}

export {
  Mail, ChevronDown, ArrowRight, ExternalLink, UserCheck, Headset,
}
