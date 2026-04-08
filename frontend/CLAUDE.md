# Frontend Build & Dev
- Package manager: `npm` (Do not use yarn or pnpm)
- Start dev server: `npm run dev`
- Run typecheck: `npm run tsc`

# Coding Standards
- Use functional components with hooks.
- Strict typing is mandatory. Do not use `any`.
- Use Tailwind CSS for all styling. Do not write custom `.css` files unless absolutely necessary.
- Data fetching must be done via React Query, not raw `useEffect` hooks.