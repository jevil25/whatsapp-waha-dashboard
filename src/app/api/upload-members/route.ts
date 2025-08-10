import { NextRequest, NextResponse } from 'next/server';
import * as XLSX from 'xlsx';
import { db } from '~/server/db';

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const file = formData.get('file') as File;
    const googleAccount = formData.get('googleAccount') as string;
    
    if (!file) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 });
    }

    if (!googleAccount) {
      return NextResponse.json({ error: 'No Google account selected' }, { status: 400 });
    }

    // Validate if the provided Google account is in the allowed list
    const allowedAccounts = process.env.GOOGLE_ACCOUNT_EMAILS?.split(',').map(email => email.trim()) || [];
    if (!allowedAccounts.includes(googleAccount)) {
      return NextResponse.json({ error: 'Invalid Google account' }, { status: 400 });
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
    const validationErrors: string[] = [];
    let rowNumber = 2; // Excel starts at 1 and header is row 1

    const members = data.map((row: any) => {
      // Validate required fields
      if (!row['First Name']) {
        validationErrors.push(`Row ${rowNumber}: First Name is required`);
      }
      if (!row['Last Name']) {
        validationErrors.push(`Row ${rowNumber}: Last Name is required`);
      }
      if (!row['Memo ID']) {
        validationErrors.push(`Row ${rowNumber}: Memo ID is required`);
      }
      
      rowNumber++;

      return {
        firstName: row['First Name'] || '',
        lastName: row['Last Name'] || '',
        phoneNumber: row['Phone Number']?.toString() || null, // Make phone number optional
        memoId: row['Memo ID']?.toString() || '',
        sheetEmail: googleAccount,
      };
    });

    // If there are validation errors, return them
    if (validationErrors.length > 0) {
      return NextResponse.json({ 
        error: 'Validation failed', 
        details: validationErrors 
      }, { status: 400 });
    }

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
