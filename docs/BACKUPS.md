# Cabinet Dealz Backups: How They Work

Written for Tom, Rich and anyone who looks after the site. Every step is short and numbered. Where a step says "Tom's choice", Tom can change it. All times are Eastern (ET) unless the Backups tab says otherwise.

## 1. Overview

| What | Where the main copy lives | Backup copy | How often | How long it is kept | Who checks it |
|---|---|---|---|---|---|
| Database (orders, affiliates, catalog, CRM) | TiDB Cloud | TiDB Cloud automatic backup. Optional dump file on the flash drive. | Daily (TiDB). Daily dump if `mysqldump` is installed on the PC. | Set by your TiDB plan: 1 day on the free plan, 1 to 30 days on a paid plan (default 14). Dumps: same as the flash drive. | Chief of Staff weekly, Tom monthly |
| Uploaded files and documents (images, logos, PDFs, IDs, W-9s, contracts, resumes) | Supabase Storage, buckets `site-media` and `private-files` | A full copy on the 2 TB flash drive | Daily, at the time set in the admin Backups tab (default 3:00 AM ET) | 90 days of separate daily snapshots (30-day groups, see below) | Chief of Staff weekly, Tom monthly |
| Code | GitHub (`7809tom-sys/cabinet-frontend` and `cabinet-backend`) | Mirror copies on the flash drive | Sundays (part of the daily run), plus GitHub itself on every push | Dated folders on the drive, cleaned with the same 90-day rule | Chief of Staff weekly |
| Off-site master drive | A second drive kept away from the office | A copy of the flash drive | Weekly suggested (Tom's choice) | Same 90-day layout | Tom |

**The flash drive** keeps 90 days of separate daily snapshots, one dated folder per day, grouped by age:

- **Days 1 to 30** (today is day 1)
- **Days 31 to 60**
- **Days 61 to 90**

`INDEX.txt` on the drive lists which snapshots are in which group. The drive never deletes anything by itself. Snapshots older than the retention are only listed as "would remove" until the cleanup runs with `-Prune` / `--prune`.

## 2. Who does what and when

| Who | Role | What they do | When |
|---|---|---|---|
| Tom | Owner | Keeps the master off-site drive. Copies the flash drive to it, or swaps the drives. Runs the quarterly test restore with the developer. | Weekly suggested (Tom's choice); quarterly test |
| Rich | Admin | May change the backup time, timezone or days kept in the admin **Operations > Backups** tab. Any admin can. | When needed |
| Automatic | The Windows PC | Checks every 15 minutes. Backs up once the configured time has passed each day (default 3:00 AM ET) and today's snapshot is not done. Reports the result to the Backups tab. | Daily |
| Chief of Staff (Tom's AI assistant) | Weekly verification | Checks the Backups tab log for 7 daily successes. Confirms the TiDB last-backup time and retention. Checks the GitHub main commits. Flags any gap to Tom. | Weekly |
| Everyone with admin access | Watch the banner | If the Backups tab shows an amber or red banner, tell Tom. | Any time |

## 3. How the schedule works

1. The Windows task starts the runner **every 15 minutes**. It is not tied to a fixed time.
2. Each time, the runner asks the website for the schedule (daily time, timezone, days to keep).
3. It backs up only if the configured time has passed today in that timezone **and** today's snapshot is not already finished on the drive.
4. If the website cannot be reached, it uses the last schedule it saved (`schedule-cache.json` next to the scripts), or 03:00 America/New_York.
5. It tells the Backups tab when a run starts and finishes. If that report fails, the backup still runs and the result is in the log file on the drive.
6. To change the time, use the Backups tab. Nothing changes on the PC.

## 4. TiDB Cloud database (automatic daily backup)

TiDB Cloud backs up your database every day on its own. What you must do is **check the plan**, because the plan decides how many days of backups exist.

What TiDB's documentation says (https://docs.pingcap.com/tidbcloud/backup-and-restore-serverless/):

- Backups run daily on Starter and Essential instances.
- Free Starter: backups are kept for **1 day**. The backup time is fixed.
- Starter with a spending limit above 0, or Essential: retention is **1 to 30 days** (default **14**). You can choose the backup time.
- Restore always creates a **new** instance. It never overwrites the current one.
- Point-in-time restore is available only on Essential.

**Check the plan, retention and last backup:**

1. Sign in at https://tidbcloud.com/.
2. Click your instance name.
3. In the left menu, click **Data**, then **Backup**.
4. The newest backup should be from the last 24 hours.
5. Click **Backup Setting** to see or change retention and backup time (paid plans).
6. If retention is 1 day and you want more, set a spending limit above 0 and set retention to 30 days. This is Tom's decision.

**Restore (only when data is really lost or broken):**

1. In **Data > Backup**, click **Restore**.
2. Choose the backup (or a point in time, on Essential).
3. Name the new instance and click **Restore**. Wait until it says Available.
4. Logins from the old instance are **not** copied. Create a database user in the new instance and copy its connection string.
5. Test the new instance first (look at a few orders and affiliates).
6. To switch the site, change `DATABASE_URL` on the backend service in Railway to the new connection string. Railway restarts the service. Keep the old instance until you are sure.

**Optional dump file:** if `mysqldump` is installed on the PC, each snapshot also gets `database\cabinet_dealz.sql.gz` (no table locks). If it is missing the step is skipped and the log says so. Nothing is installed for you.

## 5. Supabase files

Supabase database backups do **not** include stored files, so our script copies them.

- **Covers:** every bucket it finds, including `site-media` and `private-files`. The log lists the buckets.
- **Read-only:** it never deletes, moves or overwrites anything in Supabase.
- **Output on the drive:**

```
E:\CabinetDealzBackups\daily\2026-11-23\site-media\...
E:\CabinetDealzBackups\daily\2026-11-23\private-files\...
E:\CabinetDealzBackups\daily\2026-11-23\manifest.json   (every file: path, size, date, sha256)
E:\CabinetDealzBackups\daily\2026-11-23\SUMMARY.txt     (counts, size, failures; says RESULT: OK)
E:\CabinetDealzBackups\INDEX.txt                        (days 1-30, 31-60, 61-90)
E:\CabinetDealzBackups\logs\backup-2026-11-23.log
```

Running it twice on the same day is safe; finished files are skipped.

**Check Supabase itself:** open https://supabase.com/dashboard/projects, confirm the project is active (free projects pause) and that Storage shows buckets `site-media` and `private-files`.

**Run by hand:**

```
node scripts\backup\backup-supabase-storage.mjs --dest "E:\CabinetDealzBackups" --env "C:\CabinetDealzBackup\backup.env"
```

**Restore one file or folder:**

1. Open the snapshot folder you want, for example `daily\2026-11-23`.
2. One file: upload it in the Supabase dashboard (Storage, pick the bucket, Upload) to the same path.
3. A folder: do a dry run first:
   ```
   node scripts\backup\restore-supabase-storage.mjs --snapshot "E:\CabinetDealzBackups\daily\2026-11-23" --bucket site-media --prefix catalog/ --env "C:\CabinetDealzBackup\backup.env" --dry-run
   ```
4. Remove `--dry-run` to restore. Files that already exist are left alone unless you add `--overwrite`.

**Restore a whole bucket:** same command without `--prefix`. If the bucket was deleted, create an empty bucket with the same name first (keep `private-files` private). Restored files upload as generic binary; if an image does not show, re-upload it from the dashboard.

## 6. Code on GitHub

1. GitHub is the main copy: https://github.com/7809tom-sys/cabinet-frontend and https://github.com/7809tom-sys/cabinet-backend.
2. **Check:** open each repo and confirm the latest commit on `main` is recent and expected.
3. Mirror copies go to `code\YYYY-MM-DD` on the drive on Sundays, as `<repo>.git` (full mirror) and `<repo>.bundle` (one file). Git for Windows must be installed; if not, the step prints a message and is skipped.
4. By hand: `powershell -ExecutionPolicy Bypass -File scripts\backup\windows\backup-github-repos.ps1 -Dest "E:\CabinetDealzBackups"`
5. Restore from a bundle: `git clone E:\CabinetDealzBackups\code\2026-11-23\cabinet-backend.bundle cabinet-backend`

## 7. Off-site flash drive and master drive

- The **2 TB flash drive** stays plugged into the PC and receives the daily snapshots. The default folder is `E:\CabinetDealzBackups`; use whatever drive letter Windows gives it.
- The **master drive** is kept **off-site** (home or a safe-deposit box). It is a full copy of the flash drive made by Tom.

**Steps:**

1. Label both drives, for example "CD BACKUP FLASH" and "CD BACKUP MASTER (OFF-SITE)".
2. Encrypt both with **BitLocker To Go**. `private-files` holds IDs, W-9s and contracts, so a lost drive must be unreadable. Right-click the drive in File Explorer, choose **Turn on BitLocker**, set a password, and save the recovery key somewhere safe that is not on the drive.
3. **Copy to the master weekly** (suggested default; Tom's choice). Plug in the master, copy the whole `CabinetDealzBackups` folder (for example `robocopy "E:\CabinetDealzBackups" "F:\CabinetDealzBackups" /E`), open `INDEX.txt` to check it looks right, eject, and take it off-site.
4. Optional (Tom's choice): keep two master drives and swap them each visit so one is always off-site.
5. Cleanup, about monthly. First see what would go:
   ```
   node scripts\backup\rotate-backups.mjs --dest "E:\CabinetDealzBackups"
   ```
   If the "would remove" list holds only snapshots older than the retention (default 90 days), delete them:
   ```
   node scripts\backup\rotate-backups.mjs --dest "E:\CabinetDealzBackups" --prune
   ```
   It only touches dated folders inside `daily` on that drive.

Why `INDEX.txt` and not three moving folders: snapshots never move, so an interrupted copy can resume safely and the master drive stays identical in layout. The age groups are worked out from the folder dates each time.

## 8. The admin Backups tab

Open **Admin > Operations > Backups** (`/admin?tab=backups`). It shows:

1. A banner: green when the last success is recent, amber if no success in over 26 hours, red if over 50 hours.
2. Link cards: TiDB Cloud, Supabase, GitHub, the flash drive folder path (with a Copy button), and this runbook.
3. The **backup schedule** (daily time, timezone, days to keep) with who last changed it. Any admin can edit it.
4. The **backup log**, newest first: date, time (in the configured zone), what was backed up, status, files, size, duration, machine, error. It has a status filter, paging and CSV export.

If the tab says "Needs a database update", the backup tables are not created yet. Tom runs `docs/sql/0285_backup_runs.tidb.sql` in the TiDB editor, then reloads.

## 9. Checklists

**Daily (automatic):** the PC backs up at the configured time. The PC must be on and the flash drive plugged in.

**Weekly (Chief of Staff, and Tom for the drive swap):**
1. Backups tab log shows 7 daily successes in a row.
2. TiDB Cloud, **Data > Backup**: newest backup within 24 hours, retention as expected.
3. GitHub: latest commits on `main` for both repos look right.
4. Tom copies the flash drive to the off-site master (suggested weekly; Tom's choice).
5. Any gap is flagged to Tom.

**Monthly (Tom):**
1. Run the cleanup (section 7, step 5).
2. Check free space on the flash drive.
3. Open `INDEX.txt` and confirm the last 30 snapshots say `ok`.

**Quarterly: test restore (do not skip):**
1. Pick one file from the newest snapshot and compare it with the same file in Supabase.
2. In TiDB Cloud, restore the latest backup to a **new** test instance, look at a few tables, then delete the test instance.
3. Note the date you tested.

## 10. Keys and settings

The backup PC needs a private file, for example `C:\CabinetDealzBackup\backup.env`. It is **never** put in GitHub and **never** on the flash drive.

```
SUPABASE_URL=https://<your-project>.supabase.co
SUPABASE_SERVICE_ROLE_KEY=<paste here>
BACKUP_REPORT_TOKEN=<the same random value that is set on Railway>
DATABASE_URL=<only for the optional database dump>
```

**The new setting `BACKUP_REPORT_TOKEN`:**

1. Make a random value (any 32+ character secret). One way: `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`.
2. Add it on Railway to the **backend** service as `BACKUP_REPORT_TOKEN`. Railway restarts the service.
3. Put the same value in the PC key file as `BACKUP_REPORT_TOKEN=...`.
4. If it is not set on Railway, the backup endpoints answer 503 and the PC falls back to its cached or default schedule; backups still run.
5. Optional in the PC key file: `BACKUP_API_URL=https://api.cabinetdealz.com` (this is the default).
6. Right-click the key file, Properties, Security: only your Windows user should read it.
7. The scripts never print the keys. Backup folders hold file names and hashes only. The report to the website contains the machine name, drive path, counts and sizes, and no customer data.
8. If the PC is lost, rotate the Supabase service role key and `BACKUP_REPORT_TOKEN`, and update Railway.

## 11. One-time setup on the PC

1. Check Node: open PowerShell and run `node -v`. It must show v18 or newer. If not, install from nodejs.org.
2. Plug in the 2 TB flash drive. Note its letter. Turn on BitLocker To Go.
3. Create `C:\CabinetDealzBackup\backup.env` (section 10).
4. Get the backend repo onto the PC (clone or download), then in PowerShell from its folder run:
   ```
   powershell -ExecutionPolicy Bypass -File scripts\backup\windows\install-scheduled-task.ps1 -Dest "E:\CabinetDealzBackups" -EnvFile "C:\CabinetDealzBackup\backup.env"
   ```
5. Test it once (this backs up right now):
   ```
   powershell -ExecutionPolicy Bypass -File scripts\backup\windows\run-daily-backup.ps1 -Dest "E:\CabinetDealzBackups" -EnvFile "C:\CabinetDealzBackup\backup.env" -Force
   ```
6. Open the newest file in `E:\CabinetDealzBackups\logs`, then reload the Backups tab and confirm the run appears.

## 12. Troubleshooting

| Problem | What to do |
|---|---|
| Backups tab says "Needs a database update" | Run `docs/sql/0285_backup_runs.tidb.sql` in the TiDB editor, then reload. |
| Amber or red banner | Check the PC is on, the flash drive is plugged in, and read the newest log in `logs`. Run the test command in section 11, step 5. |
| Nothing happens on the PC | The runner is silent when the drive is missing or the backup is not due. Plug in the drive, or use `-Force` to test. |
| Log says it could not report to the Backups tab | Check `BACKUP_REPORT_TOKEN` matches on Railway and in the key file. The backup itself still ran. |
| "Node.js is not installed" | Install Node 18 or newer, open a new PowerShell window, check `node -v`. |
| "Missing SUPABASE_URL ..." | The key file path or names are wrong. Compare with section 10. |
| `HTTP 401` or `403` listing or downloading | The service role key is wrong or rotated. Paste the current one into the key file. |
| `Expected bucket missing` | A bucket was renamed or removed. Tell the developer. Other buckets still back up. |
| `RESULT: FAILED` in SUMMARY.txt | Run again with `-Force`. Finished files are skipped. If the same file fails twice, send its name to the developer. |
| "SKIPPED database dump: mysqldump is not installed" | Normal. TiDB's own daily backup still runs. |
| Task did not run | Open Task Scheduler, find "CabinetDealz Backup Check", right-click, Run. The task also catches up when the PC starts. |
| Drive is full | Run the cleanup (section 7, step 5), or use a bigger drive. |

## Files for this system

- `scripts/backup/backup-supabase-storage.mjs`, `rotate-backups.mjs`, `backup-tidb.mjs`, `restore-supabase-storage.mjs`
- `scripts/backup/check-due.mjs`, `report-run.mjs`, `schedule.mjs`, `lib.mjs`
- `scripts/backup/windows/run-daily-backup.ps1`, `install-scheduled-task.ps1`, `backup-github-repos.ps1`
- `docs/sql/0285_backup_runs.tidb.sql` (database tables for the Backups tab)
- Backend: `server/routers/backups.ts`, `server/backupReport.ts`, `server/lib/backups.ts`
