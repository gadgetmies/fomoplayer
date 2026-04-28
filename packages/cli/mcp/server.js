#!/usr/bin/env node
'use strict'
const { Server } = require('@modelcontextprotocol/sdk/server/index.js')
const { StdioServerTransport } = require('@modelcontextprotocol/sdk/server/stdio.js')
const { CallToolRequestSchema, ListToolsRequestSchema } = require('@modelcontextprotocol/sdk/types.js')
const { FomoPlayerClient } = require('../src/client')
const { defineTools } = require('./tools')

const client = new FomoPlayerClient()
const tools = defineTools(client)
const server = new Server({ name: 'fomoplayer', version: '1.0.0' }, { capabilities: { tools: {} } })

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: tools.map(({ name, description, inputSchema }) => ({ name, description, inputSchema })),
}))
server.setRequestHandler(CallToolRequestSchema, async ({ params: { name, arguments: args } }) => {
  const tool = tools.find((t) => t.name === name)
  if (!tool) throw new Error(`Unknown tool: ${name}`)
  try {
    return { content: [{ type: 'text', text: JSON.stringify(await tool.handler(args ?? {}), null, 2) }] }
  } catch (err) {
    return { content: [{ type: 'text', text: `Error: ${err.message}` }], isError: true }
  }
})
server.connect(new StdioServerTransport()).catch((err) => { process.stderr.write(`MCP error: ${err.message}\n`); process.exit(1) })
