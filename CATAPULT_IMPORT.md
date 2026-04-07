# Catapult PDF Drill Import

This document describes the Catapult PDF drill import system for the breidablik-readiness application.

## Overview

The system allows coaches to import drill data from Catapult "Drill breakdown" PDFs directly into the drill_library database. It consists of two main components:

1. **PDF Parser** (`src/lib/catapult-pdf-parser.ts`) - Extracts drill metrics from PDF text
2. **API Route** (`src/app/api/coach/import-drills/route.ts`) - Handles file upload and database upsert

## Installation

The implementation requires the `pdf-parse` npm package to extract text from PDFs:

```bash
npm install pdf-parse
```

Note: `pdf-parse` is listed as an optional dependency in package.json. The code handles the case where it's not installed and provides a clear error message.

## API Endpoint

### POST `/api/coach/import-drills`

**Authentication**: Requires coach/admin role with team access

**Request Format**: `multipart/form-data`

**Parameters**:
- `file` (required) - Catapult drill breakdown PDF file
- `team_id` (optional) - Target team ID (defaults to coach's primary team)

**Response**:
```json
{
  "imported": [
    {
      "drillName": "Possession",
      "date": "2026-04-07",
      "distanceM": 2274,
      "velB5": 41,
      "velB6": 5,
      "hirDistM": 45,
      "playerLoad": 199,
      "accelB23": 119,
      "decelB23": 29,
      "accelTotal": 32,
      "decelTotal": 153,
      "maxVelocity": 28.4
    }
  ],
  "skipped": [],
  "errors": []
}
```

**Error Responses**:
- `400` - Missing file, invalid file type, or missing authentication
- `401` - Unauthorized (not a coach or admin)
- `403` - No access to requested team
- `500` - Server error (PDF parsing failed, database error)

## PDF Format Analysis

### Expected Structure

The Catapult "Drill breakdown" PDF contains:

**Page 1**:
- Header with team name and session date (DD/MM/YYYY format)
- SESSION SUMMARY table with drill metrics
- Sub-table with acceleration/deceleration B2-3 metrics per drill

**Page 2**:
- SESSION SUMMARY table with max velocity data per drill

### Data Extraction

The parser extracts the following metrics per drill:

| Field | Source | Example |
|-------|--------|---------|
| `drillName` | Drill name column | "Possession", "SSG 10v10" |
| `date` | PDF header | "2026-04-07" (converted from DD/MM/YYYY) |
| `distanceM` | Avg Dist (m) | 2274 |
| `velB5` | Vel B5 Avg Dist (m) | 41 |
| `velB6` | Vel B6 Avg Dist (m) | 5 |
| `hirDistM` | HIR Dist (m) | 45 |
| `playerLoad` | Avg PL (Sess) | 199 |
| `accelB23` | Acc B2-3 Avg Effs (Sess) | 119 |
| `decelB23` | Decel B2-3 Avg Effs (Sess) | 29 |
| `accelTotal` | Tot As (#) | 32 |
| `decelTotal` | Tot Ds (#) | 153 |
| `maxVelocity` | Max Vel (km/h) - Page 2 | 28.4 |

## Implementation Details

### Parser Logic (`parseCatapultDrillPdf`)

1. **PDF to Text**: Converts PDF buffer to plain text using `pdf-parse`
2. **Date Extraction**: Finds date in header (DD/MM/YYYY) and converts to YYYY-MM-DD
3. **Page 1 Parsing**: Extracts drill rows with 10 numeric fields using regex
4. **Page 2 Parsing**: Extracts drill rows with 9 numeric fields (includes max velocity)
5. **Merge**: Combines data from both pages, prioritizing Page 1 base metrics

### Regex Patterns

**Page 1 Pattern**:
```regex
^([A-Za-z\s10v]+?)\s{2,}(\d+)\s+(\d+)\s+(\d+)\s+(\d+)\s+(\d+)\s+(\d+)\s+(\d+)\s+(\d+)\s+(\d+)$
```
Matches: `drillName  dist  vb5  vb6  hir  pl  accelB23  accelTotal  decelB23  decelTotal`

**Page 2 Pattern**:
```regex
^([A-Za-z\s10v]+?)\s{2,}(\d+)\s+(\d+)\s+(\d+)\s+(\d+)\s+([\d.]+)\s+(\d+)\s+(\d+)\s+(\d+)$
```
Matches: `drillName  dist  vb5  vb6  hir  maxVel  pl  accelTotal  decelTotal`

### API Route Logic

1. **Authentication**: Uses `requireCoachAccessForTeam` to verify access
2. **Validation**: Checks for file presence and PDF format
3. **Parsing**: Calls parser with buffer
4. **Categorization**: Maps drill names to drill_library categories:
   - "possession" → possession drills
   - "ssg" → small-sided games
   - "transition" → transition drills
   - "running" → running drills
   - "finishing" → finishing drills
   - "warmup" → warmup drills
   - "other" → default for unrecognized drills
5. **Database Upsert**: Inserts/updates drill_library rows with:
   - `source: "catapult"`
   - `created_by: null` (can be updated to authenticated user if needed)
   - Calculated `player_load_per_min` from distance and player load

## Database Schema

The drills are inserted into the `drill_library` table with the following fields:

```sql
INSERT INTO drill_library (
  team_id, category, drill_name, description, drill_format,
  distance_m, vel_b5, vel_b6, hir_total, player_load, player_load_per_min,
  accel_b23, decel_b23, accel_total, decel_total,
  metabolic_power_avg, metabolic_power_peak, hmld_m, time_above_threshold_s,
  jump_count, ima_cod_total, high_ima,
  source, created_by
) VALUES (...)
ON CONFLICT (team_id, drill_name, source) DO UPDATE SET ...
```

The upsert key is `(team_id, drill_name, source)` to prevent duplicates when the same PDF is uploaded multiple times.

## Error Handling

The API provides detailed error messages:

- **PDF Parse Error**: "Failed to parse PDF: [error message]"
- **Missing Dependencies**: "pdf-parse package is required. Install it with: npm install pdf-parse"
- **Database Errors**: Detailed error per drill, returning all successes/failures
- **Auth Errors**: "Forbidden" or unauthorized messages from `requireCoachAccessForTeam`

## Usage Example

### cURL

```bash
curl -X POST http://localhost:3000/api/coach/import-drills \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -F "file=@catapult_drill_breakdown.pdf" \
  -F "team_id=team-id-123"
```

### JavaScript/Fetch

```javascript
const formData = new FormData();
formData.append("file", pdfFile);
formData.append("team_id", "team-id-123");

const response = await fetch("/api/coach/import-drills", {
  method: "POST",
  headers: {
    "Authorization": `Bearer ${token}`
  },
  body: formData
});

const { imported, skipped, errors } = await response.json();
console.log(`Imported ${imported.length} drills`);
if (errors.length > 0) {
  console.error("Errors:", errors);
}
```

## Testing

To test the implementation:

1. Ensure `pdf-parse` is installed
2. Have a valid Catapult drill breakdown PDF
3. Authenticate as a coach with team access
4. Send multipart POST to `/api/coach/import-drills`
5. Check the response for import status and errors

## Troubleshooting

### "pdf-parse package is required"

Install the package:
```bash
npm install pdf-parse
```

### "Cannot find module '@/lib/catapult-pdf-parser'"

Ensure the file exists at `/src/lib/catapult-pdf-parser.ts`

### "No drills found in PDF"

The PDF format may differ from expected. Check:
- Date format in header (should be DD/MM/YYYY)
- Drill row format (drill name followed by 10 numbers)
- Text extraction (try opening PDF in text editor to verify content)

### Drills not inserted

Check:
- Team ID is valid and accessible to authenticated coach
- Drill names don't contain special characters that conflict with regex
- Database constraints (unique keys, foreign keys)
- Supabase permissions for drill_library table

## Future Enhancements

- [ ] Set `created_by` to authenticated user ID
- [ ] Add bulk operation status tracking (e.g., job ID)
- [ ] Support for multiple PDF formats
- [ ] Field mapping configuration (allow custom category mappings)
- [ ] Duplicate detection (warn if drill name already exists)
- [ ] Session metadata extraction (date, team name, duration)
- [ ] CSV export of imported drills
- [ ] Webhook notification on completion
