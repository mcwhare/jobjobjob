// graphSettings.js

export const GRAPH_SETTINGS = {
  layout: {
    endpointGridSpacing: 220, // Distance between nodes in the Friends and Companies grids
    stageSpacing: 190,        // Horizontal distance between each stage column
    baseSpread: 350,          // Base horizontal distance from the center to the outer columns
  },
  physics: {
    collisionRadiusOffset: 10, // Extra invisible padding around nodes to prevent overlap
    collisionStrength: 1.2,    // How aggressively nodes push each other apart when overlapping (0 to 1+)
    repulsionStrengthStage: -400,   // Stage-node repulsion (negative = push apart)
    repulsionStrengthCompany: -1600, // Company-node repulsion (negative = push apart)
    
    // Gravity settings (how strongly nodes are pulled to their target X/Y coordinates)
    xGravityStage: 0.18,       
    yGravityStage: 0.04,
    xGravityCompany: 0.15,
    yGravityCompany: 0.15,
    
    initialJitter: 50,         // Amount of random spread when nodes first spawn (prevents them from getting stuck perfectly on top of each other)
  },
  edges: {
    multiEdgeSeparation: 25,   // Distance between multiple edges connecting the exact same two nodes
  }
};