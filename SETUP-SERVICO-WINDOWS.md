# 🚀 GUIA COMPLETO - INSTALAÇÃO DO SERVIÇO VIAWEB WINDOWS

## 📋 Índice
1. [Pré-requisitos](#pré-requisitos)
2. [Instalação do NSSM](#instalação-do-nssm)
3. [Criação do Serviço](#criação-do-serviço)
4. [Configuração](#configuração)
5. [Testes e Verificação](#testes-e-verificação)
6. [Gerenciamento](#gerenciamento)
7. [Troubleshooting](#troubleshooting)

---

## 📦 Pré-requisitos

- ✅ Node.js instalado
- ✅ Projeto Viaweb funcionando manualmente
- ✅ Acesso de Administrador ao Windows
- ✅ SQL Server configurado e acessível

---

## 🔧 Instalação do NSSM

### Opção A: Download Manual (Recomendado)

```powershell
# 1. Baixar NSSM
# Visite: https://nssm.cc/download
# Baixe: nssm-2.24.zip

# 2. Extrair para C:\nssm
New-Item -Path "C:\nssm" -ItemType Directory -Force
# Extrair manualmente o ZIP para C:\nssm

# 3. Adicionar ao PATH (opcional, facilita uso)
$env:Path += ";C:\nssm\win64"
[Environment]::SetEnvironmentVariable("Path", $env:Path, [System.EnvironmentVariableTarget]::Machine)
```

### Opção B: Via Chocolatey (Mais Rápido)

```powershell
# Executar PowerShell como Administrador

# Instalar Chocolatey (se não tiver)
Set-ExecutionPolicy Bypass -Scope Process -Force
[System.Net.ServicePointManager]::SecurityProtocol = [System.Net.ServicePointManager]::SecurityProtocol -bor 3072
iex ((New-Object System.Net.WebClient).DownloadString('https://community.chocolatey.org/install.ps1'))

# Instalar NSSM
choco install nssm -y

# Agora pode usar 'nssm' direto
```

---

## 🎯 Criação do Serviço

### ⚠️ IMPORTANTE: Execute como Administrador

```powershell
# Abrir PowerShell como Administrador
# Win + X > "Terminal (Admin)" ou "PowerShell (Admin)"

# Navegar para o diretório do NSSM
cd C:\nssm\win64

# OU se instalou via Chocolatey, pode executar de qualquer lugar
```

### Criar o Serviço

```powershell
# AJUSTE OS CAMINHOS CONFORME SEU AMBIENTE!

# Caminho do Node.js (verificar com: where.exe node)
$nodePath = "C:\Program Files\nodejs\node.exe"

# Caminho do projeto
$projectPath = "C:\Autohotkey V2\Projects\Viaweb - HTML Client"

# Caminho do server.js
$serverScript = "$projectPath\server.js"

# Nome do serviço (sem espaços)
$serviceName = "ViawebCotrijal"

# Display Name (pode ter espaços)
$displayName = "Viaweb Cotrijal - Sistema de Alarmes"

# Instalar serviço
.\nssm.exe install $serviceName $nodePath $serverScript

# OU se usou Chocolatey:
nssm install $serviceName $nodePath $serverScript
```

---

## ⚙️ Configuração

```powershell
# Todas as configurações abaixo (ajuste $serviceName se usou nome diferente)
$serviceName = "ViawebCotrijal"
$projectPath = "C:\Autohotkey V2\Projects\Viaweb - HTML Client"

# 1. Configurar diretório de trabalho
.\nssm.exe set $serviceName AppDirectory $projectPath

# 2. Configurar logs
$logsPath = "$projectPath\logs"
New-Item -Path $logsPath -ItemType Directory -Force
.\nssm.exe set $serviceName AppStdout "$logsPath\service.log"
.\nssm.exe set $serviceName AppStderr "$logsPath\service-error.log"

# 3. Rotação de logs (10MB por arquivo)
.\nssm.exe set $serviceName AppStdoutCreationDisposition 4
.\nssm.exe set $serviceName AppStderrCreationDisposition 4
.\nssm.exe set $serviceName AppRotateFiles 1
.\nssm.exe set $serviceName AppRotateOnline 1
.\nssm.exe set $serviceName AppRotateSeconds 86400
.\nssm.exe set $serviceName AppRotateBytes 10485760

# 4. CRÍTICO: Configurar para iniciar ANTES do login
.\nssm.exe set $serviceName Start SERVICE_AUTO_START
.\nssm.exe set $serviceName ObjectName LocalSystem

# 5. Configurar reinício automático em caso de falha
.\nssm.exe set $serviceName AppRestartDelay 5000
.\nssm.exe set $serviceName AppThrottle 1500
.\nssm.exe set $serviceName AppExit Default Restart

# 6. Descrição do serviço
.\nssm.exe set $serviceName Description "Sistema de monitoramento de alarmes Viaweb para Cotrijal. Integração com centrais de alarme via protocolo Viaweb."

# 7. Display Name
.\nssm.exe set $serviceName DisplayName "Viaweb Cotrijal - Sistema de Alarmes"
```

### Verificar Configuração

```powershell
# Ver todas as configurações
.\nssm.exe dump $serviceName

# Ver configurações específicas
.\nssm.exe get $serviceName Start
.\nssm.exe get $serviceName ObjectName
.\nssm.exe get $serviceName AppDirectory
.\nssm.exe get $serviceName AppStdout
```

---

## 🚀 Iniciar o Serviço

```powershell
# Iniciar serviço
.\nssm.exe start $serviceName

# Aguardar alguns segundos
Start-Sleep -Seconds 5

# Verificar status
.\nssm.exe status $serviceName

# Deve retornar: SERVICE_RUNNING
```

---

## 🧪 Testes e Verificação

### Script de Verificação Completa

```powershell
# ========================================
# SCRIPT DE VERIFICAÇÃO COMPLETA
# Execute como Administrador
# ========================================

$serviceName = "ViawebCotrijal"  # Ajuste se necessário

Write-Host "`n" ("=" * 70) -ForegroundColor Cyan
Write-Host "🔍 VERIFICAÇÃO COMPLETA DO SERVIÇO VIAWEB" -ForegroundColor Cyan
Write-Host ("=" * 70) -ForegroundColor Cyan

# 1. Status do Serviço
Write-Host "`n📊 STATUS DO SERVIÇO:" -ForegroundColor Yellow
Write-Host ("-" * 70)

try {
    $svc = Get-Service $serviceName -ErrorAction Stop
    $wmi = Get-WmiObject -Class Win32_Service -Filter "Name='$serviceName'"
    
    Write-Host "   Nome: " -NoNewline
    Write-Host $svc.Name -ForegroundColor Cyan
    
    Write-Host "   Display Name: " -NoNewline
    Write-Host $svc.DisplayName -ForegroundColor Cyan
    
    Write-Host "   Status: " -NoNewline
    if ($svc.Status -eq 'Running') {
        Write-Host "✅ RUNNING" -ForegroundColor Green
    } else {
        Write-Host "❌ $($svc.Status)" -ForegroundColor Red
    }
    
    Write-Host "   StartType: " -NoNewline
    Write-Host $svc.StartType -ForegroundColor Cyan
    
    Write-Host "   StartMode: " -NoNewline
    if ($wmi.StartMode -eq 'Auto') {
        Write-Host "✅ Auto (inicia no boot)" -ForegroundColor Green
    } else {
        Write-Host "⚠️  $($wmi.StartMode)" -ForegroundColor Yellow
    }
    
    Write-Host "   Conta: " -NoNewline
    if ($wmi.StartName -eq 'LocalSystem') {
        Write-Host "✅ LocalSystem (não precisa login)" -ForegroundColor Green
    } else {
        Write-Host "⚠️  $($wmi.StartName)" -ForegroundColor Yellow
    }
    
    Write-Host "   Path: " -NoNewline
    Write-Host $wmi.PathName -ForegroundColor Cyan
    
} catch {
    Write-Host "   ❌ Serviço não encontrado!" -ForegroundColor Red
    Write-Host "   Execute a instalação primeiro." -ForegroundColor Yellow
    exit 1
}

# 2. Verificação de Portas
Write-Host "`n🌐 VERIFICAÇÃO DE PORTAS:" -ForegroundColor Yellow
Write-Host ("-" * 70)

Start-Sleep -Seconds 2

$port80 = Test-NetConnection -ComputerName localhost -Port 80 -InformationLevel Quiet -WarningAction SilentlyContinue
$port8090 = Test-NetConnection -ComputerName localhost -Port 8090 -InformationLevel Quiet -WarningAction SilentlyContinue

Write-Host "   Porta 80 (HTTP): " -NoNewline
if ($port80) {
    Write-Host "✅ ABERTA" -ForegroundColor Green
} else {
    Write-Host "❌ FECHADA" -ForegroundColor Red
}

Write-Host "   Porta 8090 (WebSocket): " -NoNewline
if ($port8090) {
    Write-Host "✅ ABERTA" -ForegroundColor Green
} else {
    Write-Host "❌ FECHADA" -ForegroundColor Red
}

# 3. Processos Node.js
Write-Host "`n💻 PROCESSOS NODE.JS:" -ForegroundColor Yellow
Write-Host ("-" * 70)

$nodeProcesses = Get-Process node -ErrorAction SilentlyContinue
if ($nodeProcesses) {
    $nodeProcesses | Format-Table Id, ProcessName, StartTime, @{
        Label='CPU(s)'; 
        Expression={$_.CPU.ToString("F2")}
    }, @{
        Label='Memory(MB)'; 
        Expression={($_.WorkingSet64 / 1MB).ToString("F2")}
    } -AutoSize
} else {
    Write-Host "   ⚠️  Nenhum processo Node.js encontrado" -ForegroundColor Yellow
}

# 4. Uptime do Sistema
Write-Host "`n⏱️  UPTIME DO SISTEMA:" -ForegroundColor Yellow
Write-Host ("-" * 70)

$os = Get-CimInstance Win32_OperatingSystem
$uptime = (Get-Date) - $os.LastBootUpTime

Write-Host "   Último Boot: " -NoNewline
Write-Host $os.LastBootUpTime.ToString('dd/MM/yyyy HH:mm:ss') -ForegroundColor Cyan

Write-Host "   Tempo Ligado: " -NoNewline
Write-Host "$($uptime.Days)d $($uptime.Hours)h $($uptime.Minutes)m" -ForegroundColor Cyan

# 5. Eventos do Sistema
Write-Host "`n📝 EVENTOS RECENTES:" -ForegroundColor Yellow
Write-Host ("-" * 70)

try {
    $events = Get-EventLog -LogName System -Source "Service Control Manager" -Newest 10 -ErrorAction SilentlyContinue | 
        Where-Object {$_.Message -like "*$serviceName*" -or $_.Message -like "*Viaweb*"}
    
    if ($events) {
        $events | ForEach-Object {
            $color = switch ($_.EntryType) {
                'Information' { 'Green' }
                'Warning' { 'Yellow' }
                'Error' { 'Red' }
                default { 'White' }
            }
            
            Write-Host "   [$($_.TimeGenerated.ToString('dd/MM HH:mm:ss'))] " -NoNewline
            Write-Host "$($_.EntryType): " -NoNewline -ForegroundColor $color
            $msg = $_.Message.Split("`n")[0]
            if ($msg.Length -gt 80) { $msg = $msg.Substring(0, 80) + "..." }
            Write-Host $msg
        }
    } else {
        Write-Host "   Nenhum evento recente encontrado" -ForegroundColor Gray
    }
} catch {
    Write-Host "   ⚠️  Não foi possível ler eventos" -ForegroundColor Yellow
}

# 6. Logs do Serviço
Write-Host "`n📄 LOGS DO SERVIÇO:" -ForegroundColor Yellow
Write-Host ("-" * 70)

$projectPath = "C:\Autohotkey V2\Projects\Viaweb - HTML Client"
$logFile = "$projectPath\logs\service.log"
$errorLogFile = "$projectPath\logs\service-error.log"

if (Test-Path $logFile) {
    Write-Host "   Log: $logFile"
    Write-Host "   Últimas 5 linhas:"
    Get-Content $logFile -Tail 5 -ErrorAction SilentlyContinue | ForEach-Object {
        Write-Host "      $_" -ForegroundColor Gray
    }
} else {
    Write-Host "   ⚠️  Arquivo de log não encontrado: $logFile" -ForegroundColor Yellow
}

if (Test-Path $errorLogFile) {
    $errorContent = Get-Content $errorLogFile -ErrorAction SilentlyContinue
    if ($errorContent -and $errorContent.Count -gt 0) {
        Write-Host "`n   ⚠️  ERROS ENCONTRADOS:" -ForegroundColor Red
        Get-Content $errorLogFile -Tail 5 | ForEach-Object {
            Write-Host "      $_" -ForegroundColor Red
        }
    }
}

# 7. Resumo Final
Write-Host "`n" ("=" * 70) -ForegroundColor Cyan
Write-Host "📋 RESUMO DA CONFIGURAÇÃO" -ForegroundColor Cyan
Write-Host ("=" * 70) -ForegroundColor Cyan

$isCorrect = $wmi.StartMode -eq 'Auto' -and 
             $wmi.StartName -eq 'LocalSystem' -and 
             $svc.Status -eq 'Running' -and
             $port80 -and $port8090

if ($isCorrect) {
    Write-Host "`n✅ SERVIÇO CONFIGURADO PERFEITAMENTE!" -ForegroundColor Green
    Write-Host ""
    Write-Host "   ✓ Iniciará automaticamente no boot" -ForegroundColor Green
    Write-Host "   ✓ Roda como LocalSystem (independente de login)" -ForegroundColor Green
    Write-Host "   ✓ Status: Running" -ForegroundColor Green
    Write-Host "   ✓ Portas HTTP e WebSocket abertas" -ForegroundColor Green
    Write-Host ""
    Write-Host "🎉 O servidor funcionará mesmo sem usuários logados!" -ForegroundColor Green
    Write-Host ""
} else {
    Write-Host "`n⚠️  PROBLEMAS DETECTADOS:" -ForegroundColor Yellow
    Write-Host ""
    
    if ($wmi.StartMode -ne 'Auto') {
        Write-Host "   ! StartMode: $($wmi.StartMode) (deveria ser 'Auto')" -ForegroundColor Yellow
        Write-Host "     Corrigir: nssm set $serviceName Start SERVICE_AUTO_START" -ForegroundColor Cyan
    }
    
    if ($wmi.StartName -ne 'LocalSystem') {
        Write-Host "   ! Conta: $($wmi.StartName) (deveria ser 'LocalSystem')" -ForegroundColor Yellow
        Write-Host "     Corrigir: nssm set $serviceName ObjectName LocalSystem" -ForegroundColor Cyan
    }
    
    if ($svc.Status -ne 'Running') {
        Write-Host "   ! Status: $($svc.Status)" -ForegroundColor Yellow
        Write-Host "     Corrigir: nssm start $serviceName" -ForegroundColor Cyan
    }
    
    if (-not $port80) {
        Write-Host "   ! Porta 80 não está respondendo" -ForegroundColor Yellow
        Write-Host "     Verificar logs e firewall" -ForegroundColor Cyan
    }
    
    if (-not $port8090) {
        Write-Host "   ! Porta 8090 não está respondendo" -ForegroundColor Yellow
        Write-Host "     Verificar logs e firewall" -ForegroundColor Cyan
    }
    
    Write-Host ""
}

Write-Host ("=" * 70) -ForegroundColor Cyan
Write-Host ""
```

### Teste de Inicialização Automática (Simula Boot)

```powershell
# ========================================
# TESTE DE INICIALIZAÇÃO AUTOMÁTICA
# Simula um boot do sistema
# Execute como Administrador
# ========================================

$serviceName = "ViawebCotrijal"

Write-Host "`n🧪 TESTE DE INICIALIZAÇÃO AUTOMÁTICA" -ForegroundColor Cyan
Write-Host ("=" * 70)
Write-Host ""

# 1. Parar serviço
Write-Host "1️⃣  Parando serviço..." -ForegroundColor Yellow
try {
    Stop-Service $serviceName -Force -ErrorAction Stop
    Write-Host "   ✅ Serviço parado" -ForegroundColor Green
} catch {
    Write-Host "   ❌ Erro ao parar: $_" -ForegroundColor Red
    exit 1
}

Start-Sleep -Seconds 3

# 2. Verificar se parou
Write-Host "`n2️⃣  Verificando parada..." -ForegroundColor Yellow
$status = (Get-Service $serviceName).Status
Write-Host "   Status: $status" -ForegroundColor $(if($status -eq 'Stopped'){'Green'}else{'Red'})

if ($status -ne 'Stopped') {
    Write-Host "   ⚠️  Serviço não parou completamente" -ForegroundColor Yellow
}

# 3. Aguardar (simula tempo de boot)
Write-Host "`n3️⃣  Simulando boot do sistema (aguardando 3s)..." -ForegroundColor Yellow
Start-Sleep -Seconds 3

# 4. Iniciar (simula inicialização automática)
Write-Host "`n4️⃣  Iniciando automaticamente (simula boot)..." -ForegroundColor Yellow
try {
    Start-Service $serviceName -ErrorAction Stop
    Write-Host "   ✅ Comando de start enviado" -ForegroundColor Green
} catch {
    Write-Host "   ❌ Erro ao iniciar: $_" -ForegroundColor Red
    exit 1
}

# Aguardar inicialização completa
Write-Host "`n   Aguardando inicialização completa..."
for ($i = 5; $i -gt 0; $i--) {
    Write-Host "   $i..." -NoNewline
    Start-Sleep -Seconds 1
}
Write-Host " Pronto!" -ForegroundColor Green

# 5. Verificar se iniciou
Write-Host "`n5️⃣  Verificando status..." -ForegroundColor Yellow
$status = (Get-Service $serviceName).Status
Write-Host "   Status: " -NoNewline
if ($status -eq 'Running') {
    Write-Host "✅ RUNNING" -ForegroundColor Green
} else {
    Write-Host "❌ $status" -ForegroundColor Red
}

# 6. Verificar aplicação
Write-Host "`n6️⃣  Verificando se aplicação está respondendo..." -ForegroundColor Yellow
Start-Sleep -Seconds 2

$tests = @(
    @{ Port = 80; Name = "HTTP" },
    @{ Port = 8090; Name = "WebSocket" }
)

$allOk = $true
foreach ($test in $tests) {
    $result = Test-NetConnection -ComputerName localhost -Port $test.Port -InformationLevel Quiet -WarningAction SilentlyContinue
    Write-Host "   $($test.Name) (porta $($test.Port)): " -NoNewline
    if ($result) {
        Write-Host "✅ OK" -ForegroundColor Green
    } else {
        Write-Host "❌ FALHOU" -ForegroundColor Red
        $allOk = $false
    }
}

# 7. Verificar processos Node
Write-Host "`n7️⃣  Verificando processos Node.js..." -ForegroundColor Yellow
$nodeProc = Get-Process node -ErrorAction SilentlyContinue
if ($nodeProc) {
    Write-Host "   ✅ Processo Node.js encontrado (PID: $($nodeProc.Id))" -ForegroundColor Green
} else {
    Write-Host "   ❌ Nenhum processo Node.js encontrado" -ForegroundColor Red
    $allOk = $false
}

# 8. Resultado Final
Write-Host "`n" ("=" * 70)
Write-Host "📊 RESULTADO DO TESTE" -ForegroundColor Cyan
Write-Host ("=" * 70)

if ($status -eq 'Running' -and $allOk) {
    Write-Host ""
    Write-Host "🎉 TESTE BEM-SUCEDIDO!" -ForegroundColor Green
    Write-Host ""
    Write-Host "   ✅ Serviço iniciou automaticamente" -ForegroundColor Green
    Write-Host "   ✅ Aplicação está funcionando" -ForegroundColor Green
    Write-Host "   ✅ Todas as portas estão respondendo" -ForegroundColor Green
    Write-Host ""
    Write-Host "💡 O serviço funcionará corretamente após um boot do sistema!" -ForegroundColor Green
    Write-Host ""
} else {
    Write-Host ""
    Write-Host "❌ TESTE FALHOU" -ForegroundColor Red
    Write-Host ""
    Write-Host "Verifique:" -ForegroundColor Yellow
    Write-Host "   • Logs do serviço em: C:\Autohotkey V2\Projects\Viaweb - HTML Client\logs\" -ForegroundColor Cyan
    Write-Host "   • Event Viewer: eventvwr.msc" -ForegroundColor Cyan
    Write-Host "   • Configuração do NSSM: nssm dump $serviceName" -ForegroundColor Cyan
    Write-Host ""
}

Write-Host ("=" * 70)
Write-Host ""
```

### Teste Rápido de Conectividade

```powershell
# Teste rápido via browser
Start-Process "http://localhost"
Start-Process "http://192.9.100.100"

# Teste via PowerShell
Invoke-WebRequest -Uri "http://localhost/api/health" -UseBasicParsing | Select-Object StatusCode, Content
```

---

## 🎮 Gerenciamento do Serviço

### Comandos Básicos

```powershell
# Navegar para diretório do NSSM
cd C:\nssm\win64

# Status
.\nssm.exe status ViawebCotrijal

# Iniciar
.\nssm.exe start ViawebCotrijal

# Parar
.\nssm.exe stop ViawebCotrijal

# Reiniciar
.\nssm.exe restart ViawebCotrijal

# Ver configuração completa
.\nssm.exe dump ViawebCotrijal

# Editar configuração (abre GUI)
.\nssm.exe edit ViawebCotrijal

# Remover serviço
.\nssm.exe remove ViawebCotrijal confirm
```

### Via PowerShell Nativo

```powershell
# Status
Get-Service ViawebCotrijal

# Iniciar
Start-Service ViawebCotrijal

# Parar
Stop-Service ViawebCotrijal

# Reiniciar
Restart-Service ViawebCotrijal

# Detalhes
Get-Service ViawebCotrijal | Format-List *

# Ver no Event Viewer
Get-EventLog -LogName System -Source "Service Control Manager" -Newest 20 | 
    Where-Object {$_.Message -like "*Viaweb*"}
```

### Via GUI do Windows

```powershell
# Abrir gerenciador de serviços
services.msc

# Abrir Event Viewer
eventvwr.msc

# Procure por "Viaweb Cotrijal" ou "ViawebCotrijal"
```

---

## 🔍 Monitoramento

### Ver Logs em Tempo Real

```powershell
# Log normal
Get-Content "C:\Autohotkey V2\Projects\Viaweb - HTML Client\logs\service.log" -Wait -Tail 20

# Log de erros
Get-Content "C:\Autohotkey V2\Projects\Viaweb - HTML Client\logs\service-error.log" -Wait -Tail 20

# Última atualização dos logs
Get-ChildItem "C:\Autohotkey V2\Projects\Viaweb - HTML Client\logs\*.log" | 
    Select-Object Name, LastWriteTime, @{N='Size(KB)';E={[math]::Round($_.Length/1KB,2)}}
```

### Monitorar Performance

```powershell
# CPU e memória do processo Node
Get-Process node | Select-Object Id, ProcessName, CPU, @{
    N='Memory(MB)'; 
    E={[math]::Round($_.WorkingSet64/1MB,2)}
}

# Atualizar a cada 2 segundos
while($true) {
    Clear-Host
    Write-Host "=== VIAWEB COTRIJAL - MONITOR ===" -ForegroundColor Cyan
    Write-Host "Pressione Ctrl+C para sair`n"
    
    $svc = Get-Service ViawebCotrijal
    Write-Host "Status: $($svc.Status)" -ForegroundColor $(if($svc.Status -eq 'Running'){'Green'}else{'Red'})
    
    $proc = Get-Process node -ErrorAction SilentlyContinue
    if ($proc) {
        Write-Host "PID: $($proc.Id)"
        Write-Host "CPU: $($proc.CPU.ToString('F2'))s"
        Write-Host "Memória: $([math]::Round($proc.WorkingSet64/1MB,2)) MB"
        Write-Host "Threads: $($proc.Threads.Count)"
    }
    
    Start-Sleep -Seconds 2
}
```

---

## 🚨 Troubleshooting

### Serviço não inicia

```powershell
# 1. Verificar logs
Get-Content "C:\Autohotkey V2\Projects\Viaweb - HTML Client\logs\service-error.log" -Tail 50

# 2. Verificar Event Viewer
Get-EventLog -LogName Application -Newest 20 | Where-Object {$_.Source -like "*node*"}

# 3. Testar manualmente
cd "C:\Autohotkey V2\Projects\Viaweb - HTML Client"
node server.js

# 4. Verificar permissões
icacls "C:\Autohotkey V2\Projects\Viaweb - HTML Client"

# 5. Verificar dependências
npm install
```

### Portas não respondem

```powershell
# Ver quem está usando as portas
netstat -ano | findstr ":80 "
netstat -ano | findstr ":8090 "

# Verificar firewall
Get-NetFirewallRule | Where-Object {$_.DisplayName -like "*80*"}

# Adicionar regra de firewall
New-NetFirewallRule -DisplayName "Viaweb HTTP" -Direction Inbound -LocalPort 80 -Protocol TCP -Action Allow
New-NetFirewallRule -DisplayName "Viaweb WS" -Direction Inbound -LocalPort 8090 -Protocol TCP -Action Allow
```

### Banco de dados não conecta

```powershell
# Verificar .env
Get-Content "C:\Autohotkey V2\Projects\Viaweb - HTML Client\.env"

# Testar conexão SQL
# Execute isto no SQL Server Management Studio:
SELECT @@SERVERNAME, @@VERSION
```

### Erro de permissões

```powershell
# Executar como LocalSystem
.\nssm.exe set ViawebCotrijal ObjectName LocalSystem

# OU como conta específica
.\nssm.exe set ViawebCotrijal ObjectName "COTRIJAL\usuario" "senha"

# Dar permissões na pasta
icacls "C:\Autohotkey V2\Projects\Viaweb - HTML Client" /grant "NT AUTHORITY\SYSTEM:(OI)(CI)F" /T
```

### Reiniciar quando trava

```powershell
# Configurar monitoramento
.\nssm.exe set ViawebCotrijal AppThrottle 1500
.\nssm.exe set ViawebCotrijal AppExit Default Restart
.\nssm.exe set ViawebCotrijal AppRestartDelay 5000

# Configurar ações de falha no Windows
sc.exe failure ViawebCotrijal reset= 86400 actions= restart/5000/restart/5000/restart/5000
```

---

## 📚 Referências Rápidas

### Estrutura de Diretórios

```
C:\Autohotkey V2\Projects\Viaweb - HTML Client\
├── server.js              # Servidor principal
├── .env                   # Configurações (NUNCA commitar!)
├── package.json
├── node_modules/
├── logs/
│   ├── service.log       # Log do serviço
│   └── service-error.log # Erros do serviço
└── ... (outros arquivos do projeto)
```

### Variáveis de Ambiente (.env)

```env
# Portas
HTTP_PORT=80
WS_PORT=8090

# TCP Viaweb
TCP_HOST=10.0.20.43
TCP_PORT=2700

# Criptografia
VIAWEB_CHAVE=...
VIAWEB_IV=...

# Banco de dados
DB_USER=ahk
DB_PASSWORD=...
DB_SERVER=srvvdm-bd\\ASM
DB_DATABASE_ASM=ASM
DB_DATABASE_LOGS=Logs
```

### Checklist de Configuração

- [ ] Node