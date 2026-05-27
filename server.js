services:
  - type: web
    name: nexus-b2b
    runtime: node
    plan: free
    buildCommand: ""
    startCommand: "node server.js"
    envVars:
      - key: NODE_ENV
        value: production
      - key: ADMIN_PASSWORD
        sync: false
      - key: PARTNER_PASSWORD
        sync: false
