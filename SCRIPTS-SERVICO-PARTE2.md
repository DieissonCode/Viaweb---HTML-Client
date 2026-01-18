.Days)d $($uptime.Hours)h $($uptime.Minutes)m"
    
    Write-Host "`n" ("-" * 70) -ForegroundColor DarkGray
    
    Start-Sleep -Seconds 2
}
```

Salve este arquivo como: **`SCRIPTS-SERVICO.md`**

---

## 🎯 RESUMO DE USO

### Arquivos Criados
1. ✅ **SETUP-SERVICO-WINDOWS.md** - Documentação completa
2. ✅ **SCRIPTS-SERVICO.ps1** - Todos os scripts PowerShell

### Execução Rápida

```powershell
# 1. Copiar o conteúdo dos scripts do arquivo
# 2. Criar arquivos .ps1 individuais ou executar direto
# 3. Executar como Administrador

# Exemplo:
Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass
.\instalar-servico.ps1
```

🎉 **Está tudo pronto para você instalar e gerenciar o serviço!**
