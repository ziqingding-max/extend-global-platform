# Dynamic Cron Job Architecture Design

## Current State: 7 Hardcoded Cron Jobs

| # | Job Name | Current Schedule | Config Key (Settings) | Configurable? |
|---|----------|------------------|-----------------------|---------------|
| 1 | Employee Auto-Activation | Daily 00:01 Beijing | — | No |
| 2 | Auto-Lock (EOR+AOR) | Monthly 5th 00:00 Beijing | `payroll_auto_create_day` (UI exists but not wired) | **No** (hardcoded `5`) |
| 3 | Auto-Create Payroll Runs + Contractor Invoices | Monthly 5th 00:01 Beijing | `payroll_auto_create_day` / `payroll_auto_create_time` | **No** (hardcoded `5`) |
| 4 | Leave Status Transition | Daily 00:02 Beijing | — | No |
| 5 | Overdue Invoice Detection | Daily 00:03 Beijing | — | No |
| 6 | Exchange Rate Fetch | Daily 00:05 Beijing | — | No |
| 7 | Monthly Leave Accrual | Monthly 1st 00:10 Beijing | — | No |

## Target State: All Jobs Configurable via Settings

### system_config Keys

Each cron job gets an `enabled` flag and a `schedule` (time/day) config:

| Config Key | Default | Type | Description |
|------------|---------|------|-------------|
| `cron_employee_activation_enabled` | `true` | boolean | Enable/disable |
| `cron_employee_activation_time` | `00:01` | HH:mm | Daily run time (Beijing) |
| `cron_auto_lock_enabled` | `true` | boolean | Enable/disable |
| `cron_auto_lock_day` | `5` | 1-28 | Day of month |
| `cron_auto_lock_time` | `00:00` | HH:mm | Run time (Beijing) |
| `cron_payroll_create_enabled` | `true` | boolean | Enable/disable |
| `cron_payroll_create_day` | `5` | 1-28 | Day of month (= auto_lock_day + 1 min) |
| `cron_payroll_create_time` | `00:01` | HH:mm | Run time (Beijing) |
| `cron_leave_transition_enabled` | `true` | boolean | Enable/disable |
| `cron_leave_transition_time` | `00:02` | HH:mm | Daily run time (Beijing) |
| `cron_overdue_invoice_enabled` | `true` | boolean | Enable/disable |
| `cron_overdue_invoice_time` | `00:03` | HH:mm | Daily run time (Beijing) |
| `cron_exchange_rate_enabled` | `true` | boolean | Enable/disable |
| `cron_exchange_rate_time` | `00:05` | HH:mm | Daily run time (Beijing) |
| `cron_leave_accrual_enabled` | `true` | boolean | Enable/disable |
| `cron_leave_accrual_day` | `1` | 1-28 | Day of month |
| `cron_leave_accrual_time` | `00:10` | HH:mm | Run time (Beijing) |

### Architecture

```
scheduleCronJobs()
  ├── Read all cron_* configs from system_config
  ├── For each job:
  │   ├── Build cron expression from config (day + time)
  │   ├── Store ScheduledTask reference in a Map
  │   └── Register with node-cron
  └── Export rescheduleJob(jobKey) for hot-reload on Settings save
```

**Hot-reload flow:**
1. Admin saves config in Settings → backend `systemSettings.update` is called
2. After saving, backend calls `rescheduleAllJobs()` to stop all tasks and re-register with new schedules
3. No server restart needed

### Settings UI: "Scheduled Jobs" Card

A new card in the Payroll Config tab showing all 7 jobs in a table:

| Job | Schedule | Enabled | Last Run | Actions |
|-----|----------|---------|----------|---------|
| Employee Activation | Daily 00:01 | ✅ | 2026-03-14 00:01 | [Run Now] |
| Auto-Lock Data | Monthly 5th 00:00 | ✅ | 2026-03-05 00:00 | [Run Now] |
| ... | ... | ... | ... | ... |

Each row has:
- Toggle switch for enabled/disabled
- Editable time input
- Editable day input (for monthly jobs)
- "Run Now" button (manual trigger)
