import { PrismaClient } from '../src/generated/prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'
import * as dotenv from 'dotenv'

dotenv.config()

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! })

const db = new PrismaClient({ adapter } as ConstructorParameters<typeof PrismaClient>[0])

const RESOURCES = [
  // Videos
  { key: 'video_iul', label: 'Index Universal Life (IUL) Video', url: 'https://youtu.be/wX89Rk5pr6A', category: 'videos' },
  { key: 'video_fia', label: 'Fixed Index Annuity Explained', url: 'https://www.youtube.com/watch?v=FBuc3gYyFK8', category: 'videos' },
  { key: 'video_tax_brackets', label: 'Understanding Tax Brackets', url: 'https://youtu.be/VJhsjUPDulw', category: 'videos' },
  { key: 'video_million_dollar_baby', label: 'Million Dollar Baby Video', url: 'https://youtu.be/gIieZrg3_UE', category: 'videos' },
  { key: 'video_swiss_army', label: 'Swiss Army Knife of Financial Strategies', url: 'https://wealthwave.com/videos/swiss-army-knife-of-financial-strategies', category: 'videos' },
  { key: 'video_rule_72', label: 'Rule of 72', url: 'https://wealthwave.com/videos/the-rule-of-72', category: 'videos' },

  // Company
  { key: 'gfi_website', label: 'Global Financial Impact', url: 'https://globalfinancialimpact.com/', category: 'training' },
  { key: 'podcast_ed_mylett', label: 'Ed Mylett Show (Podcast)', url: 'https://www.edmylett.com/podcast', category: 'training' },
  { key: 'app_audible', label: 'Audible', url: 'https://www.audible.com/', category: 'tools' },
  { key: 'book_list_drive', label: 'Book List (Google Drive)', url: 'https://drive.google.com/drive/u/5/folders/1gEP7KRivcJ2M0ZbdGW_SQ_ePmN4E9CqO', category: 'training' },

  // Product Books
  { key: 'book_money_wealth', label: 'Money, Wealth, Life Insurance - Jake Thompson', url: 'https://drive.google.com/file/d/1E2GnEulWaZojiPNOhhTcSHM7KNgwOqgJ/view?usp=share_link', category: 'books' },
  { key: 'book_retirement_miracle', label: 'Retirement Miracle - Patrick Kelly', url: 'https://drive.google.com/file/d/1Y1vmQjqolLLlj8l4p0qu7UuD460kYJ6B/view', category: 'books' },

  // Sales Books
  { key: 'book_way_of_wolf', label: 'Way Of The Wolf - Jordan Belfort', url: 'https://drive.google.com/file/d/1OOxMTO2jKZhzB11_yDr9KHWe0-usIySM/view?usp=share_link', category: 'books' },

  // Mindset Books
  { key: 'book_rich_dad', label: 'Rich Dad Poor Dad - Robert Kiyosaki', url: 'https://drive.google.com/file/d/1cTykBmeXeOmjae0Rsu-0HeJliMQ0N-ox/view?usp=share_link', category: 'books' },
  { key: 'book_millionaire_mind', label: 'Secrets of a Millionaire Mind - T. Harv Eker', url: 'https://drive.google.com/file/d/1dVgcrP50gc7u25D6xS68yfG-y_UIwYjQ/view?usp=share_link', category: 'books' },
  { key: 'book_177_mental', label: '177 Mental Toughness Secrets - Steve Siebold', url: 'https://drive.google.com/file/d/1wbIyM-Fu8rRf-UxMzAxlHHaNuwMlSvSx/view?usp=share_link', category: 'books' },
  { key: 'book_think_grow_rich', label: 'Think & Grow Rich - Napoleon Hill', url: 'https://drive.google.com/file/d/1OFBEr-zDTQHwyuAmg0TP30wg3zRaUX3f/view?usp=share_link', category: 'books' },
  { key: 'book_born_rich', label: 'You Were Born Rich - Bob Proctor', url: 'https://drive.google.com/file/d/1MrBd6IS2zB08LUgyNp6JC7FJ1_G2Wkl-/view?usp=share_link', category: 'books' },

  // People Skills Books
  { key: 'book_win_friends', label: 'How to Win Friends & Influence People - Dale Carnegie', url: 'https://drive.google.com/file/d/1Gm3J90IYLG9ZXAk7ua-vCVPg7Jf7yZ89/view?usp=share_link', category: 'books' },

  // Leadership Books
  { key: 'book_leader_within', label: 'Developing the Leader Within You 2.0 - John C. Maxwell', url: 'https://drive.google.com/file/d/1XpTMsLE1Z_82Ebup5H13jvdMPwZRSbA8/view?usp=share_link', category: 'books' },
]

async function main() {
  for (const r of RESOURCES) {
    await db.setupResource.upsert({
      where: { key: r.key },
      create: r,
      update: { label: r.label, url: r.url, category: r.category },
    })
    console.log(`  ✓ ${r.key}`)
  }
  console.log(`\nSeeded ${RESOURCES.length} training resources.`)
}

main().then(() => db.$disconnect())
