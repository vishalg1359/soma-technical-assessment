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

### Due dates

Amber on the day it's due, red once the day is over. Dates are stored and
compared as calendar days rather than timestamps, so a task due today isn't
overdue the moment you create it — which is what comparing against the clock
gives you, since the date picker hands you midnight. The list re-renders on a
timer, so a task turns red at midnight instead of on your next reload. Verified
under five timezones and across DST.

Set the date in the add bar, or just type it: "buy groceries friday 2d" fills in
both the date and the estimate, and you can override either before the task
exists. It reads today, tomorrow, next week, in 3 days, weekday names and
"aug 12" — and knows "in 3 days" is a deadline, not a 3-day estimate. It stays
conservative on purpose: "buy sun cream" is a task called *buy sun cream*, not
"buy cream" due Sunday.

### Image previews

The task saves first and the Pexels search runs behind it, so creating a task
never waits on somebody else's API. Each task tracks where its search actually
is — pending, resolving, ready, unavailable — because a missing URL can't tell
you whether it's still looking or found nothing, and those are a spinner and a
placeholder. Kill the server mid-search and it picks the work back up on the
next read. No API key, no problem: everything works except the photos, and it
tells you why. The key never leaves the server.

### Task dependencies

Add as many blockers as you like from a dropdown of your open tasks. Finished
tasks aren't offered, because an edge that's already satisfied isn't a
dependency.

Try to make a loop and it's rejected. The cycle check is a DFS that runs *inside*
the transaction that inserts the edge, not before it — check first and write
after, and two requests adding A→B and B→A both see an acyclic graph, both
decide they're safe, and together close the loop. Duplicate edges are impossible
too: the pair is the primary key, so the database refuses them rather than
trusting application code to remember.

And blocking actually blocks. You can't tick off a task whose blocker is still
open, can't reopen a task that something finished depends on, and can't add a
blocker to something already done. All three are enforced in the API, each
inside the transaction that writes, for the same reason the cycle check is.

### The schedule

A forward and backward pass over the graph. Every task shows the real date it
can start — after its *slowest* blocker, not its first — and how many days it
can slip before it delays everything else. Zero slack is critical and gets
marked; two parallel branches of the same length make every task on both
critical, and all of them are marked.

Compare earliest finish against the due date and you get the thing the whole app
is for: a task that's perfectly fine on its own, flagged **can't make it** the
moment it ends up behind a long chain. Finish something and it all recomputes —
completed work drops to zero remaining days, so the project gets shorter and the
critical path moves.

The graph is hand-drawn SVG, no library. The forward pass already computes each
task's topological depth, so that's its column: every arrow reads left to right
because of what the data is, not because a physics simulation settled somewhere
plausible.

### The rest

Undo on complete and on delete — the delete puts back both directions of the
graph, what the task was waiting on *and* what was waiting on it. Inline editing
of title, date, estimate and blockers without leaving the row. Views for today,
upcoming, critical path and done with live counts, search, four sort orders, a
⌘K palette, and j/k/x/e/enter navigation so you never touch the mouse. Every
write is optimistic and rolls back if the server disagrees. Every state —
loading, empty, error, no image — is designed rather than blank.

### Under the hood

Next.js 14, Prisma, SQLite, with dependencies in an explicit join table.
`lib/scheduling.ts` imports nothing from Prisma or React — it takes plain
objects and returns a schedule, so the same code rejects a bad edge on the
server and draws the graph on the client, and 133 tests cover it without ever
touching a database.

The claims above are commands rather than assertions: `npm test` (TZ-pinned),
`npm run test:timezones` (five zones), `npm run typecheck`, `npm run lint`, and
`npm run test:concurrency`, which fires the racing request pairs that would
corrupt a dependency graph. Two of the invariants it checks were real bugs
before they were tests. CI runs all of it on every push.

There's no authentication — the brief describes a single shared list. Everything
that doesn't depend on knowing who the user is, is there: JSON-only writes so
another origin can't post to the API, a content security policy and frame-deny,
strict id parsing, types checked before coercion, and server-side error logging
that never leaks a stack trace to the client.

### Running locally

```bash
npm install
cp .env.example .env   # DATABASE_URL is prefilled; PEXELS_API_KEY is optional
npx prisma migrate deploy && npx prisma generate
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). Without a `PEXELS_API_KEY`
everything works except the photos, and the app says so rather than showing
empty frames.
