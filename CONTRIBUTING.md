# Contributing to KiwiFolio

Thanks for your interest in contributing to KiwiFolio!

## Development Setup

```bash
# Clone the repository
git clone https://github.com/calumochkas/kiwifolio.git
cd kiwifolio

# Install dependencies
npm install

# Generate Prisma client
npx prisma generate

# Create the database
npx prisma db push

# Start the dev server
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Running Tests

```bash
npx vitest        # Watch mode
npx vitest run    # Single run
```

## Pull Requests

1. Fork the repository and create a feature branch from `main`.
2. Make your changes and add tests where appropriate.
3. Run `npx vitest run` to ensure all tests pass.
4. Run `npm run lint` to check for linting issues.
5. Submit a pull request with a clear description of the change.

## Code Conventions

- TypeScript throughout (strict mode).
- Server Components by default; Client Components only when interactivity is needed.
- Server Actions for database mutations (not API routes where possible).
- shadcn/ui v4 components with Tailwind CSS v4.
- SQLite via Prisma ORM v7 with `@prisma/adapter-libsql`.

## Reporting Issues

Please open a [GitHub Issue](https://github.com/calumochkas/kiwifolio/issues) with steps to reproduce.
