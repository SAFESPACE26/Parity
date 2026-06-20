import { NextResponse } from 'next/server';

export async function POST() {
  return NextResponse.json({ error: 'Ledger copilot not yet implemented (M5)' }, { status: 501 });
}
