/**
 * Tool Explorer Alpine.js Component
 * Provides interactive tool catalog and execution interface
 */
function toolExplorer() {
  return {
    tools: [],
    selectedTool: null,
    formData: {},
    result: null,
    executing: false,
    searchQuery: '',
    filterCategory: '',
    lastExecution: null,
    
    async init() {
      await this.loadTools();
    },
    
    async loadTools() {
      try {
        const response = await fetch('/api/tools');
        const data = await response.json();
        this.tools = data.tools || [];
        console.log('Loaded tools:', this.tools.length);
      } catch (error) {
        console.error('Failed to fetch tools:', error);
        this.tools = [];
      }
    },
    
    get categories() {
      const cats = new Set(this.tools.map(t => t.category || 'general'));
      return Array.from(cats).sort();
    },
    
    get filteredTools() {
      let filtered = this.tools;
      
      // Filter by category
      if (this.filterCategory) {
        filtered = filtered.filter(t => 
          (t.category || 'general') === this.filterCategory
        );
      }
      
      // Filter by search query
      if (this.searchQuery) {
        const query = this.searchQuery.toLowerCase();
        filtered = filtered.filter(t =>
          t.name.toLowerCase().includes(query) ||
          t.description.toLowerCase().includes(query)
        );
      }
      
      return filtered;
    },
    
    selectTool(tool) {
      this.selectedTool = tool;
      this.resetForm();
    },
    
    resetForm() {
      this.formData = {};
      this.result = null;
      
      // Initialize form data with empty values for all parameters
      if (this.selectedTool && this.selectedTool.inputSchema) {
        const properties = this.selectedTool.inputSchema.properties || {};
        Object.keys(properties).forEach(key => {
          const schema = properties[key];
          this.formData[key] = schema.type === 'boolean' ? false : '';
        });
      }
    },
    
    isRequired(key) {
      if (!this.selectedTool || !this.selectedTool.inputSchema) {
        return false;
      }
      const required = this.selectedTool.inputSchema.required || [];
      return required.includes(key);
    },
    
    getInputType(schema) {
      if (schema.type === 'number' || schema.type === 'integer') {
        return 'number';
      }
      if (schema.type === 'boolean') {
        return 'checkbox';
      }
      return 'text';
    },
    
    async executeTool() {
      if (!this.selectedTool) return;
      
      this.executing = true;
      this.result = null;
      const startTime = performance.now();
      
      try {
        // Clean form data (remove empty strings for optional fields)
        const args = {};
        Object.keys(this.formData).forEach(key => {
          const value = this.formData[key];
          if (value !== '' && value !== null && value !== undefined) {
            // Try to parse as JSON for complex types
            const schema = this.selectedTool.inputSchema.properties[key];
            if (schema.type === 'number' || schema.type === 'integer') {
              args[key] = Number(value);
            } else if (schema.type === 'boolean') {
              args[key] = Boolean(value);
            } else if (schema.type === 'object' || schema.type === 'array') {
              try {
                args[key] = JSON.parse(value);
              } catch {
                args[key] = value;
              }
            } else {
              args[key] = value;
            }
          }
        });
        
        console.log('Executing tool:', this.selectedTool.name, 'with args:', args);
        
        const response = await fetch('/api/execute', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            tool: this.selectedTool.name,
            arguments: args
          })
        });
        
        const endTime = performance.now();
        const executionTime = Math.round(endTime - startTime);
        const data = await response.json();

        if (response.ok && data.success) {
          this.result = {
            success: true,
            data: data.data,
            executionTime,
            correlationId: data.correlationId
          };
        } else {
          this.result = {
            success: false,
            error: data.error?.message || data.error || 'Tool execution failed',
            executionTime,
            correlationId: data.correlationId
          };
        }
        this.lastExecution = data;
      } catch (error) {
        const endTime = performance.now();
        const executionTime = Math.round(endTime - startTime);
        
        this.result = {
          success: false,
          error: error.message || 'Network error',
          executionTime
        };
        this.lastExecution = null;
      } finally {
        this.executing = false;
      }
    },
    
    copyResult() {
      if (!this.result) return;
      
      const text = this.result.success 
        ? JSON.stringify(this.result.data, null, 2)
        : this.result.error;
      
      navigator.clipboard.writeText(text).then(() => {
        console.log('Result copied to clipboard');
        // Could add a toast notification here
      }).catch(err => {
        console.error('Failed to copy:', err);
      });
    }
  };
}
