import { NextRequest, NextResponse } from 'next/server';
import * as XLSX from 'xlsx';
import { db } from '~/server/db';

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const file = formData.get('file') as File;
    
    if (!file) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 });
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const workbook = XLSX.read(buffer, { type: 'buffer' });
    const firstSheetName = workbook.SheetNames[0];
    if (!firstSheetName) {
      return NextResponse.json({ error: 'No sheets found in the uploaded file' }, { status: 400 });
    }
    const worksheet = workbook.Sheets[firstSheetName];
    if (!worksheet) {
      return NextResponse.json({ error: 'Worksheet not found' }, { status: 400 });
    }
    const data = XLSX.utils.sheet_to_json(worksheet);

    // Validate and transform the data
    const members = data.map((row: any) => ({
      firstName: row['First Name'] || '',
      lastName: row['Last Name'] || '',
      phoneNumber: row['Phone Number']?.toString() || '',
      memoId: row['Memo ID']?.toString() || '',
    }));

    // Insert the members into the database
    const createdMembers = await db.clubMember.createMany({
      data: members,
    });

    return NextResponse.json({ 
      success: true, 
      membersCreated: createdMembers.count 
    });

  } catch (error) {
    console.error('Error processing excel file:', error);
    return NextResponse.json(
      { error: 'Error processing file' },
      { status: 500 }
    );
  }
}
