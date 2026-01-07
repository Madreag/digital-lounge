# Digital Lounge - Game Development Project

A digital lounge game built with TypeScript and Three.js, managed with Gastown workflow system.

## Project Setup Complete

The following has been initialized:
- TypeScript + Three.js game project in digital_lounge/
- Gastown rig with workflow management
- Game-feature formula for structured development
- Active convoy tracking the Inventory System feature

## Follow-up Instructions to Test the Game

### 1. Start the Development Server

    cd digital_lounge
    npm run dev

This will start the Vite development server at http://localhost:3000

### 2. View the Game

Open your browser and navigate to http://localhost:3000

You should see:
- A neon-lit 3D lounge environment
- Purple/cyan/orange point lights creating atmosphere
- A circular couch and coffee table
- Floating ambient orbs
- Subtle camera movement animation

### 3. Build for Production

    cd digital_lounge
    npm run build
    npm run preview

### 4. Run Tests

    cd digital_lounge
    npm test

## Gastown Workflow Commands

### Check Status
    gt status                    # View town overview
    gt convoy list               # List active convoys
    bd ready                     # Show available work

### Work with Formulas
    bd formula list              # List available formulas
    bd cook game-feature         # Cook the game-feature formula
    bd --no-daemon mol pour game-feature --var feature=<name>  # Create new feature

### Manage Work
    gt convoy create "Feature Name" <issue-id>  # Create convoy
    gt sling <bead-id> digital_lounge           # Assign work to rig
    gt convoy status <convoy-id>                # Check convoy progress

### Agent Management
    gt mayor attach              # Enter Mayor session
    gt polecat list              # List active workers
    gt witness attach            # Monitor workers

## Current Active Work

- Convoy: Inventory System (hq-cv-rs54y)
- Polecat: furiosa (assigned to design phase)

## Next Steps

1. Test the game by running npm run dev in the digital_lounge directory
2. Add new features using the game-feature formula
3. Monitor progress with gt convoy status
4. Use gt mayor attach to coordinate with the AI Mayor
