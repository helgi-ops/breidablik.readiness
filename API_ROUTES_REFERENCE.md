# Personal Trainer Plan Builder API Routes

This document outlines the API routes for the personal trainer plan builder system.

## Authentication

All routes require a Bearer token in the `Authorization` header:
```
Authorization: Bearer {jwt_token}
```

The token is extracted and validated using Supabase admin client. The authenticated user must have a coach/admin/staff role and be associated with a trainer team.

## Endpoints

### 1. Exercises

#### GET `/api/trainer/exercises`
List exercises from the exercise library with optional filtering.

**Query Parameters:**
- `search` (optional): Search by name, name_is, or description
- `type` (optional): Filter by exercise_type (`strength` or `endurance`)
- `category` (optional): Filter by category

**Response:**
```json
{
  "exercises": [
    {
      "id": "uuid",
      "name": "Trap Bar Deadlift",
      "name_is": "Icelandic name",
      "exercise_type": "strength",
      "category": "compound",
      "muscle_groups": ["quadriceps", "glutes"],
      "equipment": "barbell",
      "description": "...",
      "video_url": "...",
      "sport": "football",
      "is_bilateral": true,
      "created_at": "2026-04-07T...",
      "updated_at": "2026-04-07T..."
    }
  ]
}
```

---

### 2. Templates

#### GET `/api/trainer/templates`
List all templates for the trainer's team.

**Response:**
```json
{
  "templates": [
    {
      "id": "uuid",
      "plan_name": "12-Week Strength Block",
      "plan_type": "strength",
      "duration_weeks": 12,
      "sessions_per_week": 4,
      "readiness_enabled": true,
      "deload_volume_pct": 70,
      "deload_intensity_pct": 85,
      "notes": "...",
      "is_public": false,
      "created_at": "2026-04-07T...",
      "updated_at": "2026-04-07T..."
    }
  ]
}
```

#### POST `/api/trainer/templates`
Create a new training plan template.

**Request Body:**
```json
{
  "planName": "12-Week Strength Block",
  "planType": "strength",
  "durationWeeks": 12,
  "sessionsPerWeek": 4,
  "readinessEnabled": true,
  "readinessRedAction": "recovery",
  "readinessYellowAction": "deload",
  "deloadVolumePct": 70,
  "deloadIntensityPct": 85,
  "structure": [
    {
      "week": 1,
      "sessions": [
        {
          "dayOfWeek": 1,
          "name": "Lower Body Power",
          "type": "strength",
          "estimatedDurationMin": 60,
          "exercises": [
            {
              "exerciseId": "uuid",
              "name": "Trap Bar Deadlift",
              "sets": 3,
              "reps": "3",
              "loadType": "velocity",
              "loadValue": 0.5,
              "rpeTarget": 8,
              "tempo": "X010",
              "restSeconds": 180,
              "notes": ""
            }
          ]
        }
      ]
    }
  ],
  "notes": "Template notes",
  "isPublic": false
}
```

**Response:** `201 Created`
```json
{
  "template": {
    "id": "uuid",
    "plan_name": "...",
    "plan_type": "...",
    "duration_weeks": 12,
    "sessions_per_week": 4,
    "readiness_enabled": true,
    "deload_volume_pct": 70,
    "deload_intensity_pct": 85,
    "structure": [...],
    "notes": "...",
    "is_public": false,
    "created_at": "2026-04-07T...",
    "updated_at": "2026-04-07T..."
  }
}
```

#### GET `/api/trainer/templates/[id]`
Get a single template by ID.

**Response:**
```json
{
  "template": {
    "id": "uuid",
    "plan_name": "...",
    "plan_type": "...",
    "duration_weeks": 12,
    "sessions_per_week": 4,
    "readiness_enabled": true,
    "readiness_red_action": "recovery",
    "readiness_yellow_action": "deload",
    "deload_volume_pct": 70,
    "deload_intensity_pct": 85,
    "structure": [...],
    "notes": "...",
    "is_public": false,
    "created_at": "2026-04-07T...",
    "updated_at": "2026-04-07T..."
  }
}
```

#### PUT `/api/trainer/templates/[id]`
Update a template. All fields are optional.

**Request Body:**
```json
{
  "planName": "Updated Name",
  "durationWeeks": 16,
  "sessionsPerWeek": 5,
  "structure": [...],
  "notes": "Updated notes"
}
```

**Response:**
```json
{
  "template": { ... }
}
```

#### DELETE `/api/trainer/templates/[id]`
Delete a template.

**Response:**
```json
{
  "success": true
}
```

---

### 3. Individual Training Plans

#### GET `/api/trainer/plans`
List all individual plans created by the trainer with player details.

**Response:**
```json
{
  "plans": [
    {
      "id": "uuid",
      "playerId": "uuid",
      "playerName": "John Doe",
      "planName": "12-Week Strength Block",
      "planType": "strength",
      "status": "active",
      "startDate": "2026-04-07",
      "endDate": "2026-07-06",
      "readinessEnabled": true,
      "deloadVolumePct": 70,
      "deloadIntensityPct": 85,
      "createdAt": "2026-04-07T...",
      "updatedAt": "2026-04-07T..."
    }
  ]
}
```

#### POST `/api/trainer/plans`
Assign a template to a player (copies the template structure to a new individual plan).

**Request Body:**
```json
{
  "templateId": "uuid",
  "playerId": "uuid",
  "startDate": "2026-04-07",
  "tweaks": [
    {
      "sessionIndex": 0,
      "tweaks": [
        {
          "exerciseId": "uuid",
          "sets": 4,
          "reps": "5",
          "loadValue": 100,
          "rpeTarget": 9
        }
      ]
    }
  ]
}
```

**Response:** `201 Created`
```json
{
  "plan": {
    "id": "uuid",
    "playerId": "uuid",
    "playerName": "John Doe",
    "planName": "12-Week Strength Block",
    "planType": "strength",
    "startDate": "2026-04-07",
    "status": "active"
  }
}
```

#### GET `/api/trainer/plans/[id]`
Get a plan with all sessions and prescriptions.

**Response:**
```json
{
  "plan": {
    "id": "uuid",
    "playerId": "uuid",
    "playerName": "John Doe",
    "planName": "12-Week Strength Block",
    "planType": "strength",
    "status": "active",
    "startDate": "2026-04-07",
    "endDate": "2026-07-06",
    "readinessEnabled": true,
    "readinessRedAction": "recovery",
    "readinessYellowAction": "deload",
    "deloadVolumePct": 70,
    "deloadIntensityPct": 85,
    "notes": "...",
    "createdAt": "2026-04-07T...",
    "updatedAt": "2026-04-07T..."
  },
  "sessions": [
    {
      "id": "uuid",
      "weekNumber": 1,
      "dayOfWeek": 1,
      "sessionName": "Lower Body Power",
      "sessionType": "strength",
      "estimatedDurationMin": 60,
      "notes": "...",
      "sortOrder": 0,
      "prescriptions": [
        {
          "id": "uuid",
          "exerciseId": "uuid",
          "exerciseName": "Trap Bar Deadlift",
          "exerciseNameIs": "Icelandic name",
          "exerciseType": "strength",
          "category": "compound",
          "sets": 3,
          "reps": "3",
          "loadType": "velocity",
          "loadValue": 0.5,
          "rpeTarget": 8,
          "tempo": "X010",
          "restSeconds": 180,
          "durationMin": null,
          "hrZoneTarget": null,
          "paceTarget": null,
          "workSeconds": null,
          "restWorkSeconds": null,
          "intervalCount": null,
          "notes": "",
          "sortOrder": 0
        }
      ]
    }
  ]
}
```

#### PUT `/api/trainer/plans/[id]`
Update a plan and/or tweak individual exercises.

**Request Body:**
```json
{
  "planName": "Updated Plan Name",
  "readinessEnabled": true,
  "readinessRedAction": "recovery",
  "readinessYellowAction": "deload",
  "deloadVolumePct": 75,
  "deloadIntensityPct": 90,
  "notes": "Updated notes",
  "tweaks": [
    {
      "prescriptionId": "uuid",
      "sets": 4,
      "reps": "5",
      "loadValue": 110,
      "rpeTarget": 9,
      "tempo": "X010",
      "restSeconds": 200,
      "notes": "Increased load"
    }
  ]
}
```

**Response:**
```json
{
  "success": true
}
```

#### DELETE `/api/trainer/plans/[id]`
Archive a plan (sets status to `archived` instead of hard-deleting).

**Response:**
```json
{
  "success": true,
  "status": "archived"
}
```

---

## Data Models

### Exercise (from exercise_library)
- `id` (uuid)
- `name` (text) - English name
- `name_is` (text) - Icelandic name
- `exercise_type` (enum: strength, endurance)
- `category` (enum: compound, isolation, plyometric, olympic_lift, core, continuous, interval, tempo, threshold, sprint)
- `muscle_groups` (text[])
- `equipment` (text)
- `description` (text)
- `video_url` (text)
- `sport` (text)
- `is_bilateral` (boolean)

### TrainingPlanTemplate
- `id` (uuid)
- `team_id` (uuid)
- `created_by` (uuid)
- `plan_name` (text)
- `plan_type` (enum: strength, endurance, mixed)
- `duration_weeks` (integer)
- `sessions_per_week` (integer)
- `readiness_enabled` (boolean)
- `readiness_red_action` (enum: skip, recovery, deload)
- `readiness_yellow_action` (enum: normal, deload)
- `deload_volume_pct` (integer, default 70)
- `deload_intensity_pct` (integer, default 85)
- `structure` (jsonb) - Array of weeks with sessions and exercises
- `notes` (text)
- `is_public` (boolean)

### IndividualTrainingPlan
- `id` (uuid)
- `player_id` (uuid)
- `team_id` (uuid)
- `created_by` (uuid)
- `plan_name` (text)
- `plan_type` (enum: strength, endurance, mixed)
- `start_date` (date)
- `end_date` (date)
- `status` (enum: draft, active, paused, completed, archived)
- `readiness_enabled` (boolean)
- `readiness_red_action` (enum: skip, recovery, deload)
- `readiness_yellow_action` (enum: normal, deload)
- `deload_volume_pct` (integer)
- `deload_intensity_pct` (integer)
- `notes` (text)

### IndividualTrainingSession
- `id` (uuid)
- `plan_id` (uuid)
- `week_number` (integer)
- `day_of_week` (integer, 1-7)
- `session_name` (text)
- `session_type` (enum: strength, endurance, recovery, mixed)
- `estimated_duration_min` (integer)
- `sort_order` (integer)
- `notes` (text)

### IndividualTrainingPrescription
- `id` (uuid)
- `session_id` (uuid)
- `exercise_id` (uuid)
- `sort_order` (integer)
- Strength parameters: `sets`, `reps`, `load_type`, `load_value`, `rpe_target`, `tempo`, `rest_seconds`
- Endurance parameters: `duration_min`, `hr_zone_target`, `pace_target`, `work_seconds`, `rest_work_seconds`, `interval_count`
- `notes` (text)

---

## Error Responses

### 400 Bad Request
Missing required fields or invalid input.

### 401 Unauthorized
Invalid or missing Bearer token.

### 403 Forbidden
User does not have coach/admin/staff role or insufficient permissions.

### 404 Not Found
Resource not found or does not belong to trainer's team.

### 500 Internal Server Error
Unexpected server error.

---

## Database Schema Requirements

The following tables must exist:
- `auth.users` - Supabase auth users
- `profiles` - User profiles with role and team_id
- `teams` - Team data with team_type
- `coach_teams` - Team membership for coaches
- `staff_users` - Staff user records
- `players` - Player/client records
- `exercise_library` - Exercise catalogue
- `training_plan_templates` - Reusable plan templates
- `individual_training_plans` - Assigned plans per player
- `individual_training_sessions` - Sessions within plans
- `individual_training_prescriptions` - Exercises within sessions

A migration file (`20260407160000_training_plan_templates.sql`) is included to create the `training_plan_templates` table.

---

## Implementation Notes

### Auth Pattern
All routes follow the same authentication pattern:
1. Extract Bearer token from Authorization header
2. Validate token using Supabase admin client
3. Get user ID from auth
4. Look up user's profile to get team_id and role
5. Verify role is coach/admin/staff
6. All queries filtered by team_id for data isolation

### Team Isolation
All data is isolated by `team_id`. A trainer can only see/manage:
- Templates for their team
- Plans for players on their team
- Exercises available to all authenticated users

### Plan Assignment
When a template is assigned to a player:
1. A new `individual_training_plan` is created
2. Template's `structure` JSONB is traversed week-by-week
3. Each session in the structure creates an `individual_training_session` record
4. Each exercise in a session creates an `individual_training_prescription` record
5. Optional tweaks can override specific exercise parameters

### Archiving vs. Deletion
Plans are archived (status='archived') rather than hard-deleted to maintain audit trail and session logs.
