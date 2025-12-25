# Apache reverse proxy example

If your environment can run Node on localhost:4000, proxy a path to it:

```
ProxyPreserveHost On
ProxyRequests Off

ProxyPass        /launchops-api/  http://127.0.0.1:4000/
ProxyPassReverse /launchops-api/  http://127.0.0.1:4000/
```

Then set frontend:

- `VITE_API_BASE_URL=https://rhigby.com/launchops-api/api`

Backend `.env` should include:
- `CORS_ORIGINS=https://rhigby.com`
