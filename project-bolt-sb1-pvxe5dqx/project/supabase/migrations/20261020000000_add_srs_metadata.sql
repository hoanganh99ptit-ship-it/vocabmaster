/*
# Add Spaced Repetition (SRS) tracking metadata to vocabularies table

## Overview
Adds columns for SM-2 spaced repetition system to track memory intervals,
ease factor, review due dates, and repetition counts.

## Added Columns:
- `interval` (integer, default 1, interval in days before next review)
- `ease_factor` (double precision, default 2.5, SM-2 difficulty multiplier)
- `due_date` (timestamptz, default now(), date when next review is due)
- `repetition` (integer, default 0, consecutive successful reviews count)
*/

ALTER TABLE vocabularies
ADD COLUMN IF NOT EXISTS "interval" integer NOT NULL DEFAULT 1,
ADD COLUMN IF NOT EXISTS "ease_factor" double precision NOT NULL DEFAULT 2.5,
ADD COLUMN IF NOT EXISTS "due_date" timestamptz NOT NULL DEFAULT now(),
ADD COLUMN IF NOT EXISTS "repetition" integer NOT NULL DEFAULT 0;

CREATE INDEX IF NOT EXISTS idx_vocabularies_due_date ON vocabularies(due_date);
