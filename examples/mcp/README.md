# MCP Integration Examples

These scripts demonstrate how to use the shared `@pro-assist/core` MCP client to talk to remote tools.

## Slack DM

```
node slack.js --message "Hej team!" --user U12345
```

## Docker containers

```
node docker.js
```

Both scripts expect environment variables or configuration defining the MCP server URLs.
