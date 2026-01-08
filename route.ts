import { NextResponse } from 'next/server';
import { getPulseData } from '../explore/pulseHandler';

export async function GET() {
  const data = await getPulseData();
  return NextResponse.json(data);
}
