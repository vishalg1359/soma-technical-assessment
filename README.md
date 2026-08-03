## Soma Capital Technical Assessment

This is a technical assessment as part of the interview process for Soma Capital.

> [!IMPORTANT]  
> You will need a Pexels API key to complete the technical assessment portion of the application. You can sign up for a free API key at https://www.pexels.com/api/  

To begin, clone this repository to your local machine.

## Development

This is a [NextJS](https://nextjs.org) app, with a SQLite based backend, intended to be run with the LTS version of Node.

To run the development server:

```bash
npm i
npm run dev
```

## Task:

Modify the code to add support for due dates, image previews, and task dependencies.

### Part 1: Due Dates 

When a new task is created, users should be able to set a due date.

When showing the task list is shown, it must display the due date, and if the date is past the current time, the due date should be in red.

### Part 2: Image Generation 

When a todo is created, search for and display a relevant image to visualize the task to be done. 

To do this, make a request to the [Pexels API](https://www.pexels.com/api/) using the task description as a search query. Display the returned image to the user within the appropriate todo item. While the image is being loaded, indicate a loading state.

You will need to sign up for a free Pexels API key to make the fetch request. 

### Part 3: Task Dependencies

Implement a task dependency system that allows tasks to depend on other tasks. The system must:

1. Allow tasks to have multiple dependencies
2. Prevent circular dependencies
3. Show the critical path
4. Calculate the earliest possible start date for each task based on its dependencies
5. Visualize the dependency graph

## Submission:

1. Add a new "Solution" section to this README with a description and screenshot or recording of your solution. 
2. Push your changes to a public GitHub repository.
3. Submit a link to your repository in the application form.

Thanks for your time and effort. We'll be in touch soon!


## Solution

A todo list that schedules itself.


https://github.com/user-attachments/assets/c083e2df-746f-4a63-841c-96aadecd8b5b


Every task has a due date, an estimate in days, and whatever has to happen
before it. Give it that and it tells you when each task can actually start,
which ones you can afford to be late on, and which deadlines you've already
missed without knowing it.

### Adding tasks

Type and hit enter — the task is on screen instantly, no waiting on the server,
and it rolls back with an error if the write fails. Set the due date and
estimate right there in the add bar before you create it, or just type it:
"buy groceries friday 2d" fills both fields in for you, and you can still
override what it read. It handles today, tomorrow, next week, in 3 days,
weekday names, and "aug 12" — and it knows "in 3 days" is a date, not a 3-day
estimate.

### Due dates

Amber on the day it's due, red once the day is over. Dates are stored as
calendar days and compared as calendar days, so a task due today isn't overdue
the second you create it — which is what a timestamp comparison gives you, since
the date picker hands you midnight. The list re-renders on a timer, so a task
turns red at midnight instead of on your next reload. Tested in five timezones
and across DST.

### Image previews

The task is saved first and the Pexels search runs behind it, so creating a task
never waits on somebody else's API. The task tracks exactly where the search is
— pending, resolving, ready, unavailable — because a missing URL can't tell you
whether it's still looking or found nothing, and those are a spinner and a
placeholder. Kill the server mid-search and it picks it back up on the next
read. No API key, no problem: everything works except the photos, and it tells
you why. The key never leaves the server.

### Dependencies

Add blockers from a dropdown of your open tasks — as many as you want, and
finished tasks aren't offered, because an edge that's already satisfied isn't a
dependency.

Try to make a loop and it's rejected. The cycle check is a DFS that runs inside
the same transaction as the insert, not before it: check-then-write is a race
where two requests adding A→B and B→A both see an acyclic graph, both decide
they're safe, and together close the loop. Duplicate edges are impossible too —
the pair is the primary key, so the database refuses them rather than trusting
application code to remember.

And blocking actually blocks. You can't tick off a task whose blocker is still
open, can't reopen a task that something finished depends on, and can't add a
blocker to something already done. All three are enforced in the API; the
disabled checkbox is a courtesy so the client doesn't fire a request it knows
will fail.

### Scheduling

Forward and backward pass over the graph. Every task shows the real date it can
start — after its *slowest* blocker, not its first — and how many days it can
slip before it delays everything else. Zero slack is critical and gets marked.
Two parallel branches the same length make every task on both critical at once,
and it marks all of them rather than picking one arbitrarily.

Compare earliest finish against the due date and you get the thing the whole app
is for: a task that's perfectly fine on its own, flagged "can't make it" the
moment it ends up behind a long chain.

Finish something and everything recomputes — completed work drops to zero
remaining days, so the project gets shorter and the critical path moves.

### The graph

Hand-drawn SVG, no library. The forward pass already computes each task's
topological depth, so that's its column: every arrow reads left to right because
of what the data is, not because a physics simulation settled somewhere
plausible. Completed tasks leave the diagram — it's about the work that's left —
while still shaping the schedule behind it.

### The rest

Undo on complete and on delete (the delete brings its blockers back too). Inline
editing of title, date, estimate and blockers without leaving the row. Views for
today, upcoming, critical path and done, with live counts. Search, four sort
orders, a ⌘K palette, and j/k/x/e/enter navigation so you never touch the mouse.
Every write is optimistic and rolls back if the server disagrees, and every
state — loading, empty, error, no image — is designed rather than blank.

### Under the hood

Next.js 14, Prisma, SQLite. Dependencies are an explicit join table.
`lib/scheduling.ts` imports nothing from Prisma or React — it takes plain
objects and returns a schedule, so the same code validates on the server and
renders on the client, and 86 tests cover it without ever touching a database:
topological sort, cycle detection, slack arithmetic, deadline feasibility, the
date handling under five timezones and DST, the quick add parser, and the Pexels
client's timeout, rate limit and empty-result paths.

### Running locally

```bash
npm install
cp .env.example .env   # add your PEXELS_API_KEY (optional)
npx prisma migrate deploy && npx prisma generate
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).
