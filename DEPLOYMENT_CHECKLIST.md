# Pre-Deployment Checklist

## Code Quality
- [x] All JavaScript files have valid syntax
- [x] No ESM imports (all converted to global)
- [x] All dependencies loaded in correct order
- [x] Service worker registered

## Testing
- [x] 18 unit tests passing
- [x] ISEP validation working
- [x] Command ID uniqueness verified
- [ ] Manual testing in browser (requires server)

## Security
- [x] ISEP validation before commands
- [x] Input validation on frontend
- [x] Rate limiting implemented
- [x] CORS whitelist configured
- [x] WebSocket buffer checking

## Performance
- [x] Search indices implemented
- [x] Virtual scrolling (100 event limit)
- [x] Event cleanup working
- [x] Debounced input

## UI/UX
- [x] Dark/light mode toggle
- [x] Responsive layout
- [x] No vertical scroll required
- [x] Compact design
- [x] Mobile responsive breakpoints

## Server
- [x] Structured logging
- [x] Metrics endpoint
- [x] Heartbeat monitoring
- [x] Exponential backoff
- [x] Rate limiting

## Browser Compatibility
- [ ] Test in Chrome
- [ ] Test in Firefox
- [ ] Test in Safari
- [ ] Test in Edge
- [ ] Test on mobile

## Deployment Steps

1. **Verify dependencies (if server requires them):**
   ```bash
   npm install express ws mssql winston
   ```

2. **Check configuration:**
   - Verify database config in db-config.js
   - Update CORS whitelist in server.js if needed
   - Update TCP host/port in server.js if needed

3. **Run tests:**
   ```bash
   node __tests__/validation.test.js
   ```

4. **Start server:**
   ```bash
   node server.js
   ```

5. **Access application:**
   - Open http://localhost or http://192.9.100.100
   - Check console for errors
   - Verify WebSocket connection

6. **Test features:**
   - [ ] Select unit from dropdown
   - [ ] View partitions and zones
   - [ ] Arm/disarm commands work
   - [ ] Events display correctly
   - [ ] Filter events works
   - [ ] Theme toggle works
   - [ ] Service worker registers
   - [ ] Offline mode works (disconnect network)

7. **Monitor metrics:**
   - Visit http://localhost/api/metrics
   - Verify uptime, events, connections

8. **Check logs:**
   - Server logs should show structured output
   - No errors in browser console
   - WebSocket heartbeat working

## Post-Deployment Verification

- [ ] All units load from database
- [ ] WebSocket connects successfully
- [ ] Commands execute properly
- [ ] Events received and displayed
- [ ] Theme persists on reload
- [ ] Service worker caching works
- [ ] Rate limiting prevents abuse
- [ ] Metrics endpoint accessible
- [ ] Reconnection works after disconnect

## Rollback Plan

If issues occur:
1. Revert to previous branch
2. Clear browser cache and service worker
3. Restart server
4. Check logs for errors

## Notes

- Winston module is optional (fallback to console)
- Metrics reset on server restart (expected)
- Service worker cache persists (may need manual clear)
- Theme preference stored in localStorage
