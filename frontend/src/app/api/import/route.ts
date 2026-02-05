import { NextResponse } from 'next/server';
import { execFile } from 'child_process';
import { writeFile, unlink } from 'fs/promises';
import { tmpdir } from 'os';
import path from 'path';
import { randomUUID } from 'crypto';

function findProjectRoot(): string {
  const cwd = process.cwd();
  if (cwd.endsWith('/frontend')) {
    return path.resolve(cwd, '..');
  }
  return cwd;
}

export async function POST(request: Request) {
  let tempPath: string | null = null;

  try {
    const formData = await request.formData();
    const file = formData.get('file') as File | null;

    if (!file) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 });
    }

    if (!file.name.endsWith('.csv')) {
      return NextResponse.json({ error: 'File must be a .csv' }, { status: 400 });
    }

    // Write to temp file
    const buffer = Buffer.from(await file.arrayBuffer());
    tempPath = path.join(tmpdir(), `import-${randomUUID()}.csv`);
    await writeFile(tempPath, buffer);

    // Shell out to Python CLI
    const projectRoot = findProjectRoot();
    const scriptPath = path.join(projectRoot, 'src', 'journal.py');

    const result = await new Promise<{ stdout: string; stderr: string }>((resolve, reject) => {
      execFile(
        'python3',
        [scriptPath, 'import', tempPath!],
        { cwd: projectRoot, timeout: 30000 },
        (error, stdout, stderr) => {
          if (error && !stdout) {
            reject(error);
          } else {
            resolve({ stdout, stderr });
          }
        }
      );
    });

    // Parse result from stdout (format: "Imported X executions (Y duplicates skipped)")
    const match = result.stdout.match(/Imported (\d+) executions \((\d+) duplicates skipped\)/);
    const imported = match ? parseInt(match[1], 10) : 0;
    const skipped = match ? parseInt(match[2], 10) : 0;

    return NextResponse.json({
      success: true,
      imported,
      skipped,
      message: result.stdout.trim(),
    });
  } catch (error) {
    console.error('Import error:', error);
    const message = error instanceof Error ? error.message : 'Import failed';
    return NextResponse.json({ error: message }, { status: 500 });
  } finally {
    if (tempPath) {
      await unlink(tempPath).catch(() => {});
    }
  }
}
