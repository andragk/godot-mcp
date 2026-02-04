/**
 * Godot scene file (.tscn) parser
 * Parses Godot's custom text-based scene format
 */
/**
 * Parse .tscn file content
 */
export function parseSceneFile(content) {
    const lines = content.split('\n');
    const data = {
        format: 3,
        loadSteps: 1,
        nodes: [],
        externalResources: [],
        connectionCount: 0,
    };
    let currentSection = 'header';
    let currentNode = null;
    for (let i = 0; i < lines.length; i++) {
        const line = lines[i].trim();
        // Skip empty lines and comments
        if (!line || line.startsWith(';')) {
            continue;
        }
        // Parse header section
        if (line.startsWith('[gd_scene')) {
            const formatMatch = line.match(/format=(\d+)/);
            const loadStepsMatch = line.match(/load_steps=(\d+)/);
            if (formatMatch) {
                data.format = parseInt(formatMatch[1], 10);
            }
            if (loadStepsMatch) {
                data.loadSteps = parseInt(loadStepsMatch[1], 10);
            }
            currentSection = 'header';
            continue;
        }
        // Parse external resource
        if (line.startsWith('[ext_resource')) {
            currentSection = 'ext_resource';
            const resource = parseResourceLine(line);
            if (resource) {
                data.externalResources.push(resource);
            }
            continue;
        }
        // Parse node section
        if (line.startsWith('[node')) {
            if (currentNode && currentNode.name && currentNode.type) {
                data.nodes.push(currentNode);
            }
            currentSection = 'node';
            currentNode = parseNodeHeader(line);
            continue;
        }
        // Parse connection section
        if (line.startsWith('[connection')) {
            if (currentNode && currentNode.name && currentNode.type) {
                data.nodes.push(currentNode);
                currentNode = null;
            }
            currentSection = 'connection';
            data.connectionCount++;
            continue;
        }
        // Parse properties within node section
        if (currentSection === 'node' && currentNode) {
            parseNodeProperty(line, currentNode);
        }
    }
    // Add last node if exists
    if (currentNode && currentNode.name && currentNode.type) {
        data.nodes.push(currentNode);
    }
    // Determine root node (first node or node with name=".")
    data.rootNode = data.nodes.find((n) => n.name === '.' || n.parent === undefined)?.name;
    return data;
}
/**
 * Parse external resource line
 */
function parseResourceLine(line) {
    const typeMatch = line.match(/type="([^"]+)"/);
    const pathMatch = line.match(/path="([^"]+)"/);
    const idMatch = line.match(/id="?([^"\s]+)"?/);
    if (!typeMatch || !pathMatch || !idMatch) {
        return null;
    }
    return {
        id: idMatch[1],
        type: typeMatch[1],
        path: pathMatch[1],
    };
}
/**
 * Parse node header line
 */
function parseNodeHeader(line) {
    const node = {
        properties: {},
    };
    const nameMatch = line.match(/name="([^"]+)"/);
    const typeMatch = line.match(/type="([^"]+)"/);
    const parentMatch = line.match(/parent="([^"]+)"/);
    if (nameMatch) {
        node.name = nameMatch[1];
    }
    if (typeMatch) {
        node.type = typeMatch[1];
    }
    if (parentMatch) {
        node.parent = parentMatch[1];
    }
    return node;
}
/**
 * Parse node property line
 */
function parseNodeProperty(line, node) {
    // Handle script property specially
    if (line.startsWith('script =')) {
        const scriptMatch = line.match(/ExtResource\(\s*"?([^")\s]+)"?\s*\)/);
        if (scriptMatch) {
            node.script = scriptMatch[1];
        }
        return;
    }
    // Parse property assignments
    const propMatch = line.match(/^(\w+)\s*=\s*(.+)$/);
    if (!propMatch) {
        return;
    }
    const [, key, value] = propMatch;
    if (!key || !value) {
        return;
    }
    // Try to parse value
    node.properties[key] = parsePropertyValue(value);
}
/**
 * Parse property value (basic types only)
 */
function parsePropertyValue(value) {
    const trimmed = value.trim();
    // Boolean
    if (trimmed === 'true')
        return true;
    if (trimmed === 'false')
        return false;
    // Number
    if (/^-?\d+(\.\d+)?$/.test(trimmed)) {
        return parseFloat(trimmed);
    }
    // String (remove quotes)
    if (trimmed.startsWith('"') && trimmed.endsWith('"')) {
        return trimmed.slice(1, -1);
    }
    // Vector2, Vector3, Color, etc. - return as string for now
    return trimmed;
}
export function buildNodeHierarchy(sceneData) {
    if (sceneData.nodes.length === 0) {
        return null;
    }
    const nodeMap = new Map();
    // Create hierarchy nodes
    for (const node of sceneData.nodes) {
        nodeMap.set(node.name, {
            name: node.name,
            type: node.type,
            children: [],
            script: node.script,
        });
    }
    // Build parent-child relationships
    let root = null;
    for (const node of sceneData.nodes) {
        const hierarchyNode = nodeMap.get(node.name);
        if (!hierarchyNode)
            continue;
        if (!node.parent) {
            // No parent means this is the root node
            root = hierarchyNode;
        }
        else if (node.parent === '.') {
            // parent="." means child of root node
            if (!root && sceneData.nodes.length > 0) {
                // First node without parent is the root
                root = nodeMap.get(sceneData.nodes[0].name) || null;
            }
            if (root) {
                root.children.push(hierarchyNode);
            }
        }
        else {
            // Named parent
            const parent = nodeMap.get(node.parent);
            if (parent) {
                parent.children.push(hierarchyNode);
            }
        }
    }
    return root;
}
export function getSceneStats(sceneData) {
    const nodeTypes = {};
    let scriptedNodeCount = 0;
    for (const node of sceneData.nodes) {
        nodeTypes[node.type] = (nodeTypes[node.type] || 0) + 1;
        if (node.script) {
            scriptedNodeCount++;
        }
    }
    // Calculate max depth
    const hierarchy = buildNodeHierarchy(sceneData);
    function calculateDepth(node, depth = 0) {
        if (!node)
            return depth;
        let maxChildDepth = depth;
        for (const child of node.children) {
            maxChildDepth = Math.max(maxChildDepth, calculateDepth(child, depth + 1));
        }
        return maxChildDepth;
    }
    return {
        nodeCount: sceneData.nodes.length,
        externalResourceCount: sceneData.externalResources.length,
        connectionCount: sceneData.connectionCount,
        scriptedNodeCount,
        nodeTypes,
        maxDepth: calculateDepth(hierarchy),
    };
}
//# sourceMappingURL=scene-parser.js.map