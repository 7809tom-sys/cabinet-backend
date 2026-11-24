# Cabinet Dealz Backups: How They Work

This page is written for Tom. Every step is short and numbered. If a step says "Tom's choice", change it to whatever you prefer.

## 1. Overview

| What | Where the main copy lives | Backup copy | How often | How long it is kept | Who checks it |
|---|---|---|---|---|---|
| Database (orders, affiliates, catalog, CRM) | TiDB Cloud | TiDB Cloud automatic backup. Optional extra dump file on the flash drive. | Daily (TiDB). Daily dump if the optional tool is installed. | Set by your TiDB plan: 1 day on the free plan, 1 to 30 days on a paid plan (default 14). Dumps: 90 days on the flash drive. | Tom, weekly, in the TiDB console |
| Uploaded files and documents (images, logos, PDFs, IDs, W-9s, contracts, resumes) | Supabase Storage, buckets `site-media` and `private-files` | A full copy on the flash drive, made by `backup-supabase-storage.mjs` | Daily at 2:00 AM (Tom's choice) | 90 days of separate daily snapshots on the flash drive | Tom, weekly, by reading the log |
| Code | GitHub (`7809tom-sys/cabinet-frontend` and `cabinet-backend`) | Mirror copies on the flash drive, made by `backup-github-repos.ps1` | Weekly suggested (Tom's choice) | Dated folders. Delete the old ones by hand when you like. | Tom, monthly |
| Off-site master drive | A second drive kept away from the office | A copy of the flash drive | Weekly suggested (Tom's choice) | Same 90-day layout | Tom, monthly |

The flash drive holds separate daily snapshots grouped by age:

- **Days 1 to 30**: the newest 30 daily snapshots (today is day 1).
- **Days 31 to 60**
- **Days 61 to 90**

The drive never deletes anything by itself. Snapshots older than 90 days are only listed as "would remove" until you run the cleanup with `-Prune`.

## 2. TiDB Cloud database (automatic daily backup)

TiDB Cloud backs up your database every day on its own. Nothing to install. What you must do is **check your plan**, because the plan decides how many days of backups exist.

What TiDB's documentation says (https://docs.pingcap.com/tidbcloud/backup-and-restore-serverless/):

- Backups run daily on Starter and Essential instances.
- Free Starter: backups are kept for **1 day**. The backup time is fixed.
- Starter with a spending limit above 0, or Essential: retention is **1 to 30 days** (default **14**). You can choose the backup time.
- Restore always creates a **new** instance. It never overwrites the current one.
- Point-in-time restore is available only on Essential.

How to check your plan, retention and last backup:

1. Sign in to TiDB Cloud.
2. Click your instance name.
3. In the left menu, click **Data**, then **Backup**.
4. Read the list. The newest line should be within the last 24 hours.
5. Click **Backup Setting** to see or change retention and backup time (paid plans).
6. If retention shows 1 day and you want more, raise the plan (set a spending limit above 0) and set retention to 30 days. This is your decision.

How to restore (only when data is really lost or broken):

1. In **Data > Backup**, click **Restore**.
2. Choose the backup (or a point in time, on Essential).
3. Give the new instance a name and click **Restore**. Wait until the status says Available.
4. User logins from the old instance are **not** copied. Create a database user in the new instance and get its connection string.
5. Test the new instance first (look at a few orders and affiliates).
6. To use it, change the `DATABASE_URL` variable of the backend service in Railway to the new connection string. Railway restarts the service. Keep the old instance until you are sure.

Optional extra: if `mysqldump` is installed on your PC, the daily job also saves `database\cabinet_dealz.sql.gz` in each snapshot. It does not lock tables. If `mysqldump` is missing, the job skips it and says so in the log. Nothing is installed for you.

## 3. Supabase files

Supabase database backups do **not** include stored files. So the files are copied by our script.

What it covers: every bucket it finds, including `site-media` and `private-files`. The log lists the buckets it found.

What it does: it only reads from Supabase. It never deletes, moves or overwrites anything there.

What it writes on the drive:

```
<drive>\CabinetDealzBackups\daily\2026-11-23\site-media\...
<drive>\CabinetDealzBackups\daily\2026-11-23\private-files\...
<drive>\CabinetDealzBackups\daily\2026-11-23\manifest.json   (every file: path, size, date, sha256)
<drive>\CabinetDealzBackups\daily\2026-11-23\SUMMARY.txt     (counts, size, failures)
<drive>\CabinetDealzBackups\INDEX.txt                        (which snapshots are in days 1-30, 31-60, 61-90)
```

Running it twice on the same day is safe. Files already downloaded with the same size are skipped.

Run it by hand:

```
node scripts\backup\backup-supabase-storage.mjs --dest "E:\CabinetDealzBackups" --env "C:\CabinetDealzBackup\backup.env"
```

**Restore one file or one folder:**

1. Open the snapshot folder you want, for example `daily\2026-11-23`.
2. To restore a single file by hand, upload it in the Supabase dashboard (Storage, pick the bucket, Upload) to the same path.
3. To restore a folder with the script, first do a dry run:
   ```
   node scripts\backup\restore-supabase-storage.mjs --snapshot "E:\CabinetDealzBackups\daily\2026-11-23" --bucket site-media --prefix catalog/ --env "C:\CabinetDealzBackup\backup.env" --dry-run
   ```
4. Remove `--dry-run` to really restore. Files that already exist in Supabase are left alone. Add `--overwrite` only if you want the backup version to replace what is there.

**Restore a whole bucket:** run the same command without `--prefix`. If the bucket itself was deleted, create an empty bucket with the same name in Supabase first (keep `private-files` private).

Good to know: restored files are uploaded as generic binary files. Browsers still show images correctly in most cases. If an image does not show, re-upload it from the dashboard.

## 4. Code on GitHub

1. GitHub is the main copy of the code (`cabinet-frontend` and `cabinet-backend`).
2. Mirror copies go to the flash drive with `backup-github-repos.ps1`. It needs Git for Windows. If Git is missing, the script just says so.
3. Run it:
   ```
   powershell -ExecutionPolicy Bypass -File scripts\backup\windows\backup-github-repos.ps1 -Dest "E:\CabinetDealzBackups"
   ```
4. It makes `code\YYYY-MM-DD\<repo>.git` (a full mirror) and `<repo>.bundle` (a single file you can clone from).
5. The repos are private, so Git will use your normal GitHub sign-in on that PC.
6. To restore from a bundle: `git clone E:\CabinetDealzBackups\code\2026-11-23\cabinet-backend.bundle cabinet-backend`.

## 5. Off-site flash drive and master drive

The plan:

- The **flash drive** stays plugged into your PC and receives the daily snapshots. It holds up to 90 days, grouped 1-30, 31-60 and 61-90 in `INDEX.txt`.
- The **master drive** is kept **off-site** (for example at home or in a safe-deposit box). It is a full copy of the flash drive made by you.

Steps to keep them:

1. Label both drives with a name and a date, for example "CD BACKUP FLASH" and "CD BACKUP MASTER (OFF-SITE)".
2. Encrypt both drives with **BitLocker To Go**. The `private-files` bucket holds IDs, W-9s and contracts, so a lost drive must be unreadable. To turn it on: right-click the drive in File Explorer, choose **Turn on BitLocker**, choose a password, and save the recovery key somewhere safe that is not on the drive.
3. **Copy to the master drive weekly** (suggested default; Tom's choice). Plug in the master, copy the whole `CabinetDealzBackups` folder (or use `robocopy "E:\CabinetDealzBackups" "F:\CabinetDealzBackups" /E`), check `INDEX.txt` looks right, eject, and take it off-site.
4. Optional swap routine (Tom's choice): keep two master drives and swap them each visit so one is always off-site.
5. Once a month, run the cleanup so the drive never fills up. First see what would go:
   ```
   node scripts\backup\rotate-backups.mjs --dest "E:\CabinetDealzBackups"
   ```
   Then, if the "would remove" list holds only snapshots older than 90 days, delete them:
   ```
   node scripts\backup\rotate-backups.mjs --dest "E:\CabinetDealzBackups" --prune
   ```
   The cleanup only touches dated folders inside `daily` on that drive.

Why `INDEX.txt` and not three moving folders: snapshots never move, so a copy that was interrupted can be safely resumed, and the master drive copy stays identical in layout. The age groups are worked out from the folder dates every time.

## 6. Checklists

**Daily (automatic)**
1. The scheduled task runs at 2:00 AM. The PC must be on and the flash drive plugged in.

**Weekly (about 5 minutes)**
1. Open the newest file in `E:\CabinetDealzBackups\logs`. The last line should say `BACKUP FINISHED OK`.
2. Open the newest `daily\<date>\SUMMARY.txt`. It should say `RESULT: OK` and the file counts should look normal.
3. In TiDB Cloud, **Data > Backup**: the newest backup is from the last 24 hours.
4. Copy the flash drive to the off-site master (suggested weekly; Tom's choice) and take it off-site.
5. Run the code mirror script if you want a fresh code copy.

**Monthly**
1. Run the cleanup (section 5, step 5).
2. Check that the flash drive has free space.
3. Check that the last 30 snapshots in `INDEX.txt` say `ok`.

**Quarterly: test a restore (do not skip this)**
1. Pick one file from the newest snapshot. Compare it with the same file in Supabase. They should be identical.
2. In TiDB Cloud, restore the latest backup to a **new** test instance. Look at a few tables. Delete the test instance afterwards.
3. Write the date you tested in a notes file on your PC.

## 7. Where the keys live

1. The Supabase service role key and the database connection string live **only on your PC** in a private file, for example `C:\CabinetDealzBackup\backup.env`. It is not in GitHub, and **never on the flash drive**.
2. The file looks like this (use your real values; never share them):
   ```
   SUPABASE_URL=https://<your-project>.supabase.co
   SUPABASE_SERVICE_ROLE_KEY=<paste here>
   DATABASE_URL=<only needed for the optional database dump>
   ```
3. Right-click the file, Properties, Security, and make sure only your Windows user can read it.
4. The scripts never print the keys and never write them into the backup folders. The backup folders hold file names and hashes only.
5. If the PC is lost, rotate the Supabase service role key in the Supabase dashboard and update Railway.

## 8. Troubleshooting

| Problem | What to do |
|---|---|
| "backup drive/folder not found" | Plug in the flash drive and check its letter in File Explorer. Re-run the installer with the right `-Dest` if the letter changed. |
| "Node.js is not installed" | Install Node 18 or newer from nodejs.org, then open a new PowerShell window. Check with `node -v`. |
| "Missing SUPABASE_URL ..." | The key file path is wrong or the names inside are wrong. Compare with section 7. |
| `HTTP 401` or `403` on list or download | The service role key is wrong or was rotated. Paste the current key into the key file. |
| `Expected bucket missing` | A bucket was renamed or removed in Supabase. Tell the developer. The other buckets still back up. |
| Summary says `RESULT: FAILED` with some files listed | Re-run the same command. It skips finished files and retries the rest. If the same file fails again, note its name and tell the developer. |
| "SKIPPED database dump: mysqldump is not installed" | Normal. TiDB's own daily backup still runs. Install MySQL client tools only if you want the extra dump files. |
| mysqldump fails with an SSL or user error | Check `DATABASE_URL` in the key file, and that your TiDB connection allows your PC. Ask the developer. |
| Task did not run | Open Task Scheduler, find "CabinetDealz Daily Backup", right-click, Run. Check the PC was on at 2:00 AM. The task also runs on the next start if it was missed. |
| Drive is full | Run the cleanup (section 5, step 5). If the newest snapshots alone do not fit, use a bigger drive. |

## Files for this system

- `scripts/backup/backup-supabase-storage.mjs`
- `scripts/backup/rotate-backups.mjs`
- `scripts/backup/backup-tidb.mjs`
- `scripts/backup/restore-supabase-storage.mjs`
- `scripts/backup/windows/run-daily-backup.ps1`
- `scripts/backup/windows/install-scheduled-task.ps1`
- `scripts/backup/windows/backup-github-repos.ps1`
