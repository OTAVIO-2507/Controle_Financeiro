// Objeto global que armazena todos os dados da aplicação.
// É ele que será salvo e carregado do armazenamento do navegador (localStorage).
let appData = {
    // Dados do usuário (como o nome que aparece na tela inicial)
    user: { name: 'Usuário' },
    // Configurações gerais da aplicação (ex: tema claro ou escuro)
    settings: {
        theme: 'light'
    },
    // Lista onde ficarão todas as transações (receitas e despesas)
    transactions: [],
    // Lista das metas financeiras criadas pelo usuário
    goals: [
        { id: 'g1', name: 'Reserva de Emergência', icon: 'shield-alert', target: 20000, current: 0 },
        { id: 'g2', name: 'Entrada da Casa', icon: 'car', target: 150000, current: 0 }
    ]
};

// Variáveis para guardar as instâncias dos gráficos da biblioteca Chart.js.
// Isso é necessário para podermos "destruir" (apagar) o gráfico antigo antes de desenhar um novo quando houver atualizações.
let pieChartInstance = null;
let barChartInstance = null;

// Funções utilitárias para formatar valores.
// formatCurrency: Formata um número para o padrão de moeda do Brasil (ex: R$ 1.500,00)
const formatCurrency = (val) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(val);

// formatCurrencyCompact: Formata números muito grandes de forma compacta (ex: R$ 1,5 mil)
const formatCurrencyCompact = (val) => new Intl.NumberFormat('pt-BR', { notation: "compact", style: 'currency', currency: 'BRL' }).format(val);

// formatDate: Recebe uma data (ex: 2024-03-15) e formata para um estilo legível (ex: 15 de mar.)
const formatDate = (dateString) => {
    // Adiciona uma hora fictícia para evitar problemas de fuso horário onde o dia poderia voltar para o dia anterior.
    const d = new Date(dateString + 'T00:00:00');
    return new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: 'short' }).format(d);
};

// Função que mapeia categorias para nomes de ícones da biblioteca Lucide.
function getCategoryIcon(category) {
    switch (category.toLowerCase()) {
        case 'alimentação': return 'coffee';
        case 'moradia': return 'home';
        case 'trabalho': return 'briefcase';
        case 'compras': return 'shopping-cart';
        case 'lazer': return 'video';
        default: return 'help-circle'; // Ícone padrão caso não encontre a categoria
    }
}

// Função responsável por carregar os dados salvos anteriormente no navegador.
function loadData() {
    // Busca a string 'financeFlowData' no LocalStorage
    const saved = localStorage.getItem('financeFlowData');
    if (saved) {
        try {
            // Se encontrar, converte a string de volta para o objeto JavaScript
            appData = JSON.parse(saved);
        } catch (e) {
            console.error('Error parsing localStorage data', e);
        }
    }
    // Caso de compatibilidade (se o usuário for antigo e ainda não tinha o campo settings), nós garantimos que existe.
    if (!appData.settings) {
        appData.settings = { theme: 'light' };
    }
}

// Função responsável por salvar o estado atual do programa no navegador.
// Deve ser chamada sempre que criarmos, deletarmos ou editarmos uma meta/transação.
function saveData() {
    localStorage.setItem('financeFlowData', JSON.stringify(appData));
}

// Globais para modo de edição. Guardam temporariamente o ID da transação ou meta sendo editada.
let editingTxId = null;
let editingGoalId = null;

// A função mais importante. É ela que engatilha a atualização de todas as partes visuais na tela
// para garantir que a interface sempre reflita os dados mais recentes de `appData`.
function updateDashboard() {
    let inc = 0, exp = 0;
    // Calcula o total de receitas e despesas somando apenas transações do tipo 'income' e 'expense'.
    // Transações do tipo 'goal' são ignoradas propositalmente para não afetar o Saldo, Receitas ou Despesas.
    appData.transactions.forEach(t => {
        if (t.type === 'income') inc += t.amount;
        else if (t.type === 'expense') exp += t.amount;
    });
    
    // Saldo é a Receita menos as Despesas
    const balance = inc - exp;
    
    // Para simplificar, o "dinheiro guardado" (economia) é o saldo restante positivo
    const savings = balance > 0 ? balance : 0;

    // Distribui as economias equitativamente entre as metas para efeito demonstrativo
    distributeSavingsToGoals(savings);

    // Atualiza o nome do usuário na tela de boas-vindas
    document.getElementById('user-name-display').innerText = appData.user.name;
    
    // Certifica-se de que as cores (claro ou escuro) estão corretas
    applyTheme();

    // Redesenha todos os componentes chamando suas respectivas funções
    renderSummaryCards(inc, exp, balance, savings);
    renderTransactions();
    renderCharts();
    renderGoalsDashboard();
    renderGoalsEditList();
    
    // Processo obrigatório para que a biblioteca renderize novos ícones na tela onde não existiam
    lucide.createIcons();
}

// Distribui as economias automaticamente entre as metas que NÃO têm depósitos manuais,
// preservando os valores já aportados diretamente pelo usuário via tipo 'goal'.
function distributeSavingsToGoals(totalSavings) {
    if (appData.goals.length === 0) return;

    // Calcula quanto cada meta já recebeu via depósitos manuais (tipo 'goal')
    const manualDeposits = {};
    appData.transactions
        .filter(t => t.type === 'goal' && t.goalId)
        .forEach(t => {
            manualDeposits[t.goalId] = (manualDeposits[t.goalId] || 0) + t.amount;
        });

    // Metas sem depósito manual recebem a distribuição automática proporcional
    const goalsWithoutManual = appData.goals.filter(g => !manualDeposits[g.id]);
    const perGoal = goalsWithoutManual.length > 0 ? totalSavings / goalsWithoutManual.length : 0;

    appData.goals = appData.goals.map(g => ({
        ...g,
        current: manualDeposits[g.id] !== undefined ? manualDeposits[g.id] : perGoal
    }));
}

// Função que gera o HTML dos 4 cartões principais no topo do Dashboard
// (Saldo, Receitas, Despesas, Economia)
function renderSummaryCards(income, expense, balance, savings) {
    const container = document.getElementById('summary-cards');
    container.className = 'grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6';
    const savingsPercent = income > 0 ? Math.round((savings / income) * 100) : 0;

    container.innerHTML = `
        <div class="card group relative overflow-hidden">
            <div class="absolute -bottom-6 -right-4 opacity-[0.04] dark:opacity-[0.02] group-hover:scale-110 group-hover:opacity-[0.08] transition-all duration-500">
                <i data-lucide="wallet" class="w-32 h-32 text-blue-600 dark:text-blue-400"></i>
            </div>
            <div class="flex justify-between items-start mb-3 relative z-10">
                <div>
                    <h3 class="text-slate-500 text-sm font-medium">Saldo Atual</h3>
                    <h2 class="text-3xl font-bold text-slate-900 dark:text-white mt-1">${formatCurrencyCompact(balance)}</h2>
                </div>
                <div class="p-2 bg-blue-50 dark:bg-blue-500/10 text-blue-600 dark:text-blue-400 rounded-xl relative z-10">
                    <i data-lucide="dollar-sign" class="w-5 h-5"></i>
                </div>
            </div>
            <div class="text-xs text-slate-400 dark:text-slate-500 mt-2 relative z-10 leading-relaxed">
                O valor total disponível (Receitas menos Despesas).
            </div>
        </div>

        <div class="card group relative overflow-hidden">
            <div class="absolute -bottom-6 -right-4 opacity-[0.04] dark:opacity-[0.02] group-hover:scale-110 group-hover:opacity-[0.08] transition-all duration-500">
                <i data-lucide="trending-up" class="w-32 h-32 text-emerald-600 dark:text-emerald-400"></i>
            </div>
            <div class="flex justify-between items-start mb-3 relative z-10">
                <div>
                    <h3 class="text-slate-500 text-sm font-medium">Receitas</h3>
                    <h2 class="text-3xl font-bold text-slate-900 dark:text-white mt-1">${formatCurrencyCompact(income)}</h2>
                </div>
                <div class="p-2 bg-emerald-50 dark:bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 rounded-xl relative z-10">
                    <i data-lucide="trending-up" class="w-5 h-5"></i>
                </div>
            </div>
            <div class="text-xs text-slate-400 dark:text-slate-500 mt-2 relative z-10 leading-relaxed">
                Todo o dinheiro que entrou (Salário, Vendas, etc).
            </div>
        </div>

        <div class="card group relative overflow-hidden">
            <div class="absolute -bottom-6 -right-4 opacity-[0.04] dark:opacity-[0.02] group-hover:scale-110 group-hover:opacity-[0.08] transition-all duration-500">
                <i data-lucide="trending-down" class="w-32 h-32 text-rose-600 dark:text-rose-400"></i>
            </div>
            <div class="flex justify-between items-start mb-3 relative z-10">
                <div>
                    <h3 class="text-slate-500 text-sm font-medium">Despesas</h3>
                    <h2 class="text-3xl font-bold text-slate-900 dark:text-white mt-1">${formatCurrencyCompact(expense)}</h2>
                </div>
                <div class="p-2 bg-rose-50 dark:bg-rose-500/10 text-rose-600 dark:text-rose-400 rounded-xl relative z-10">
                    <i data-lucide="trending-down" class="w-5 h-5"></i>
                </div>
            </div>
            <div class="text-xs text-slate-400 dark:text-slate-500 mt-2 relative z-10 leading-relaxed">
                Todos os seus gastos e pagamentos realizados.
            </div>
        </div>

        <div class="card bg-white/80 border-white relative overflow-hidden">
            <div class="absolute top-0 right-0 p-4 opacity-5">
                <i data-lucide="piggy-bank" class="w-32 h-32 text-emerald-600"></i>
            </div>
            <div class="flex justify-between items-start mb-4 relative z-10">
                <h3 class="text-slate-800 text-base font-semibold">Resumo da Economia</h3>
                <i data-lucide="target" class="w-5 h-5 text-slate-400"></i>
            </div>
            <div class="relative z-10 mt-2 flex flex-col items-center justify-center">
                <div class="w-24 h-24 rounded-full border-[6px] border-emerald-100 dark:border-emerald-500/20 flex items-center justify-center relative shadow-sm">
                    <div class="absolute inset-0 rounded-full border-[6px] border-emerald-500 border-t-transparent border-l-transparent rotate-45"></div>
                    <span class="text-2xl font-bold text-slate-800 dark:text-white">${savingsPercent}%</span>
                </div>
                <p class="text-sm text-slate-500 mt-3 text-center">da receita foi poupada</p>
            </div>
            <div class="mt-4 flex justify-between items-center text-xs font-medium border-t border-slate-100 dark:border-slate-700/50 pt-3 relative z-10">
                <span class="text-slate-400">Total guardado</span>
                <span class="text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-500/10 px-2 py-1 rounded-md">${formatCurrency(savings)}</span>
            </div>
        </div>

    `;
}

// Função responsável por desenhar a lista de transações recentes na tabela do Dashboard
function renderTransactions() {
    const tbody = document.getElementById('transactions-list');
    
    if (appData.transactions.length === 0) {
        tbody.innerHTML = `<tr><td colspan="4" class="py-8 text-center text-slate-500">Nenhuma transação encontrada. Comece a adicionar!</td></tr>`;
        return;
    }

    tbody.innerHTML = appData.transactions.slice(0, 6).map(t => {
        const isIncome = t.type === 'income';
        const isGoal = t.type === 'goal';

        // Define ícone, cor e símbolo de seta baseado no tipo
        const icon = isGoal ? 'flag' : getCategoryIcon(t.category);
        const typeIcon = isGoal ? 'star' : (isIncome ? 'arrow-up-right' : 'arrow-down-right');
        const typeClass = isGoal
            ? 'bg-violet-50 dark:bg-violet-500/10 text-violet-600 dark:text-violet-400 border-violet-100 dark:border-violet-500/20'
            : (isIncome
                ? 'bg-emerald-50 dark:bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-100 dark:border-emerald-500/20'
                : 'bg-rose-50 dark:bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-100 dark:border-rose-500/20');
        const iconBg = isGoal
            ? 'bg-violet-50 dark:bg-violet-500/10 text-violet-500 border-violet-100 dark:border-violet-500/20'
            : 'bg-slate-50 dark:bg-slate-800 text-slate-500 dark:text-slate-400 group-hover:bg-blue-50 dark:group-hover:bg-blue-500/10 group-hover:text-blue-600 dark:group-hover:text-blue-400 border-slate-100 dark:border-slate-700/50';

        // Label de categoria: para metas, mostra o nome da meta
        let categoryLabel = t.category;
        if (isGoal && t.goalId) {
            const goal = appData.goals.find(g => g.id === t.goalId);
            if (goal) categoryLabel = `→ ${goal.name}`;
        }

        return `
            <tr class="border-b border-slate-100 dark:border-slate-700/50 hover:bg-white/40 dark:hover:bg-slate-800/40 transition-colors group">
                <td class="py-4 px-2">
                    <div class="flex items-center gap-3">
                        <div class="p-2 rounded-xl transition-colors border ${iconBg}">
                            <i data-lucide="${icon}" class="w-4 h-4"></i>
                        </div>
                        <div>
                            <span class="block font-semibold text-slate-800 dark:text-slate-100">${t.description}</span>
                            <span class="text-xs text-slate-400">${categoryLabel}</span>
                        </div>
                    </div>
                </td>
                <td class="py-4 text-slate-500 dark:text-slate-400 text-sm font-medium">${formatDate(t.date)}</td>
                <td class="py-4">
                    <div class="inline-flex items-center gap-1.5 font-bold text-sm px-2.5 py-1 rounded-md border ${typeClass}">
                        <i data-lucide="${typeIcon}" class="w-3.5 h-3.5"></i>
                        <span class="dark:text-white">${formatCurrency(t.amount)}</span>
                    </div>
                </td>
                <td class="py-4 text-right pr-2">
                    <div class="flex items-center justify-end gap-1">
                        <button class="p-2 text-slate-400 hover:text-slate-800 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg transition-colors cursor-pointer" onclick="editTransaction('${t.id}')">
                            <i data-lucide="edit-2" class="w-4 h-4"></i>
                        </button>
                        <button class="p-2 text-slate-400 hover:text-slate-800 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg transition-colors cursor-pointer" onclick="deleteTransaction('${t.id}')">
                            <i data-lucide="trash-2" class="w-4 h-4 text-rose-400 hover:text-rose-600"></i>
                        </button>
                    </div>
                </td>
            </tr>
        `;
    }).join('');
}

// Abre a janela flutuante (Modal) para editar uma transação existente
window.openEditModal = function (id) {
    // Busca a transação específica no array pelo ID
    const tx = appData.transactions.find(t => t.id === id);
    if (!tx) return;

    editingTxId = id;

    // Preenche os campos do formulário do modal com os dados atuais da transação
    document.getElementById('edit-form-desc').value = tx.description;
    document.getElementById('edit-form-amount').value = tx.amount;
    document.getElementById('edit-form-date').value = tx.date;

    // Força a atualização da lista de categorias dependendo se é Receita ou Despesa
    if (window.setEditType) {
        window.setEditType(tx.type);
    }

    // Aplica um pequeno atraso para garantir que a categoria seja setada após o HTML do select atualizar
    setTimeout(() => {
        document.getElementById('edit-form-category').value = tx.category;
    }, 10);

    // Remove a classe "hidden" para exibir o modal na tela
    document.getElementById('edit-modal').classList.remove('hidden');
}

// Fecha o modal de edição de transações, limpando o ID selecionado
window.closeEditModal = function () {
    editingTxId = null;
    document.getElementById('edit-modal').classList.add('hidden');
}

// Atalho antigo mantido para compatibilidade, ele apenas chama a abertura do modal
window.editTransaction = function (id) {
    openEditModal(id);
}

// Exclui uma transação
window.deleteTransaction = function (id) {
    // window.confirm cria um aviso nativo de "Tem certeza?"
    if (confirm('Tem certeza que deseja remover esta transação?')) {
        // Filtra removendo do array a que tem o ID igual ao deletado
        appData.transactions = appData.transactions.filter(t => t.id !== id);
        saveData(); // Salva a alteração
        updateDashboard(); // Atualiza a tela sem recarregar a página
    }
}

// Aplica visualmente os estilos de Modo Escuro / Claro baseados nas configurações do usuário
function applyTheme() {
    const isDark = appData.settings.theme === 'dark';
    if (isDark) {
        // Adiciona a classe "dark" à raiz do documento HTML (o <html>) e muda o ícone para o 'sol'
        document.documentElement.classList.add('dark');
        document.getElementById('theme-icon').setAttribute('data-lucide', 'sun');
    } else {
        // Remove a classe "dark" e muda o ícone de volta para 'lua'
        document.documentElement.classList.remove('dark');
        document.getElementById('theme-icon').setAttribute('data-lucide', 'moon');
    }

    // Como as cores dos gráficos do Chart.js não respondem automaticamente ao CSS, precisamos redesenhá-los
    if (pieChartInstance || barChartInstance) {
        renderCharts();
    }
}

// Função engatilhada pelo botão de lua/sol que alterna entre claro e escuro e salva a preferência
window.toggleTheme = function () {
    // Se for dark, vira light. Se não, vira dark.
    appData.settings.theme = appData.settings.theme === 'dark' ? 'light' : 'dark';
    saveData();
    applyTheme();
    lucide.createIcons(); // Recarrega o ícone do botão
}

// Renderiza o componente lateral de resumo das Metas (Mostrando o Progresso)
function renderGoalsDashboard() {
    const container = document.getElementById('goals-card');
    const calculateProgress = (curr, target) => Math.min(Math.round((curr / target) * 100), 100);

    let html = `
        <div class="pb-4 border-b border-slate-200 dark:border-slate-700/50">
            <h3 class="font-semibold text-lg text-slate-800 dark:text-white">Metas Financeiras</h3>
            <p class="text-xs text-slate-500 dark:text-slate-400 mt-1">Acompanhe a sua jornada financeira</p>
        </div>
        <div class="space-y-6">
    `;

    if (appData.goals.length === 0) {
        html += `<p class="text-sm text-slate-500 dark:text-slate-400">Nenhuma meta configurada.</p>`;
    }

    appData.goals.slice(0, 3).forEach((g, i) => {
        const colors = ['yellow', 'emerald', 'blue', 'purple'];
        const color = colors[i % colors.length];
        const prog = calculateProgress(g.current, g.target);

        html += `
            <div>
                <div class="flex justify-between text-sm mb-3">
                    <div class="flex items-center gap-2 text-slate-700 dark:text-slate-100">
                        <i data-lucide="${g.icon || 'target'}" class="w-4 h-4 text-${color}-500"></i>
                        <span class="font-semibold">${g.name}</span>
                    </div>
                    <span class="text-slate-500 dark:text-slate-400 font-medium text-xs">
                        <span class="dark:text-white">${formatCurrencyCompact(g.current)}</span> / <span class="dark:text-white">${formatCurrencyCompact(g.target)}</span>
                    </span>
                </div>
                <div class="w-full bg-slate-100 dark:bg-slate-700/50 rounded-full h-3 overflow-hidden border border-slate-200 dark:border-slate-600/50 shadow-inner">
                    <div class="bg-${color}-400 h-full rounded-full transition-all duration-1000 relative" style="width: ${prog}%">
                        <div class="absolute inset-0 bg-white/20"></div>
                    </div>
                </div>
                <div class="mt-2 flex items-start gap-2 text-xs text-slate-500 dark:text-slate-400">
                    <i data-lucide="${prog >= 100 ? 'check-circle-2' : 'trending-up'}" class="w-4 h-4 text-${color}-500 shrink-0"></i>
                    <span>Progresso: ${prog}% da meta atingido.</span>
                </div>
            </div>
        `;
    });

    html += `</div>`;
    container.innerHTML = html;

}

// Renderiza a lista de Metas na aba de "Configurações" (onde é possível editar e deletar)
function renderGoalsEditList() {
    const container = document.getElementById('goals-list-edit');
    if (!container) return; // Se o container não existir na tela atual, aborta a função

    // Mensagem de estado vazio
    if (appData.goals.length === 0) {
        container.innerHTML = `<p class="text-sm text-slate-500">Nenhuma meta adicionada.</p>`;
        return;
    }

    container.innerHTML = appData.goals.map(g => `
        <div class="flex items-center justify-between p-4 bg-slate-50 rounded-xl border border-slate-100">
            <div class="flex items-center gap-3">
                <div class="p-2 bg-white dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700/50 shadow-sm">
                    <i data-lucide="${g.icon}" class="w-5 h-5 text-slate-600 dark:text-slate-300"></i>
                </div>
                <div>
                    <h4 class="font-semibold text-slate-800">${g.name}</h4>
                    <p class="text-xs text-slate-500">Alvo: <span>${formatCurrency(g.target)}</span></p>
                </div>
            </div>
            <div class="flex items-center justify-end gap-1">
                <button class="p-2 text-slate-400 hover:text-slate-800 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg transition-colors cursor-pointer" onclick="openEditGoalModal('${g.id}')">
                    <i data-lucide="edit-2" class="w-4 h-4"></i>
                </button>
                <button class="p-2 text-slate-400 hover:text-slate-800 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg transition-colors cursor-pointer" onclick="deleteGoal('${g.id}')">
                    <i data-lucide="trash-2" class="w-4 h-4 text-rose-400 hover:text-rose-600"></i>
                </button>
            </div>
        </div>
    `).join('');
// Atualiza o Progresso e exibe novamente a interface
}

// Abre o modal de edição de metas
window.openEditGoalModal = function (id) {
    const goal = appData.goals.find(g => g.id === id);
    if (!goal) return;

    editingGoalId = id; // Marca qual meta estamos editando
    
    // Preenche os dados atuais no modal
    document.getElementById('edit-goal-name').value = goal.name;
    document.getElementById('edit-goal-target').value = goal.target;
    document.getElementById('edit-goal-icon').value = goal.icon;
    
    // Mostra o modal (removendo a classe 'hidden' do TailwindCSS)
    document.getElementById('edit-goal-modal').classList.remove('hidden');
}

// Fecha o modal de metas e reseta o ID
window.closeEditGoalModal = function () {
    editingGoalId = null;
    document.getElementById('edit-goal-modal').classList.add('hidden');
}

// Deleta uma meta (disparado pelo botão da lixeira)
window.deleteGoal = function (id) {
    if (confirm('Remover esta meta?')) {
        // Remove a meta retendo apenas as que têm o ID diferente
        appData.goals = appData.goals.filter(g => g.id !== id);
        saveData();
        updateDashboard();
    }
}

// Função responsável por desenhar os gráficos (Gráfico de Pizza e de Barras) usando Chart.js
function renderCharts() {
    // Paleta de cores moderna customizada
    const COLORS = ['#10b981', '#facc15', '#3b82f6', '#f43f5e', '#8b5cf6', '#64748b'];

    // --- Lógica Gráfico de Pizza (Gastos por Categoria) ---
    const expenses = appData.transactions.filter(t => t.type === 'expense');
    
    // Agrupa os gastos pelo nome da categoria somando seus valores. Ficará como: { "Alimentação": 500, "Lazer": 150 }
    const expensesByCategory = expenses.reduce((acc, curr) => {
        acc[curr.category] = (acc[curr.category] || 0) + curr.amount;
        return acc;
    }, {});

    const pieLabels = Object.keys(expensesByCategory);
    const pieData = Object.values(expensesByCategory);

    const isDark = appData.settings && appData.settings.theme === 'dark';
    const gridColor = isDark ? '#334155' : '#e2e8f0';
    const textColor = isDark ? '#cbd5e1' : '#64748b';

    if (pieChartInstance) pieChartInstance.destroy();

    const pieCtx = document.getElementById('pieChart').getContext('2d');

    if (pieData.length === 0) {
        pieChartInstance = new Chart(pieCtx, {
            type: 'doughnut',
            data: { labels: ['Sem dados'], datasets: [{ data: [1], backgroundColor: ['#e2e8f0'], borderWidth: 0 }] },
            options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false }, tooltip: { enabled: false } } }
        });
    } else {
        pieChartInstance = new Chart(pieCtx, {
            type: 'doughnut',
            data: {
                labels: pieLabels,
                datasets: [{
                    data: pieData,
                    backgroundColor: COLORS,
                    borderWidth: 0,
                    borderRadius: 5,
                    cutout: '70%'
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: { position: 'bottom', labels: { usePointStyle: true, boxWidth: 8, font: { size: 11 }, color: textColor } },
                    tooltip: {
                        callbacks: {
                            label: function (context) { return ' ' + formatCurrency(context.raw); }
                        }
                    }
                }
            }
        });
    }

    // --- Lógica Gráfico de Barras (Receitas vs Despesas Mensais) ---
    // Agrupa todos os valores por mês. { "2024-03": { Receitas: 1000, Despesas: 500 } }
    const monthlyFlowMap = appData.transactions.reduce((acc, curr) => {
        const month = curr.date.substring(0, 7); // Pega apenas AAAA-MM
        if (!acc[month]) acc[month] = { name: month, Receitas: 0, Despesas: 0 };
        
        if (curr.type === 'income') acc[month].Receitas += curr.amount;
        else acc[month].Despesas += curr.amount;
        return acc;
    }, {});

    const monthlyFlow = Object.values(monthlyFlowMap).sort((a, b) => a.name.localeCompare(b.name)).map(item => {
        const parts = item.name.split('-');
        const date = new Date(parseInt(parts[0]), parseInt(parts[1]) - 1);
        const monthStr = date.toLocaleString('pt-BR', { month: 'short' });
        return {
            ...item,
            label: monthStr.charAt(0).toUpperCase() + monthStr.slice(1)
        };
    });

    if (barChartInstance) barChartInstance.destroy();

    const barCtx = document.getElementById('barChart').getContext('2d');

    if (monthlyFlow.length === 0) {
        barChartInstance = new Chart(barCtx, {
            type: 'bar',
            data: { labels: ['Sem dados'], datasets: [{ label: 'Vazio', data: [0], backgroundColor: gridColor }] },
            options: { responsive: true, maintainAspectRatio: false, scales: { y: { beginAtZero: true, max: 100 } }, plugins: { legend: { display: false }, tooltip: { enabled: false } } }
        });
    } else {
        barChartInstance = new Chart(barCtx, {
            type: 'bar',
            data: {
                labels: monthlyFlow.map(d => d.label),
                datasets: [
                    {
                        label: 'Receitas',
                        data: monthlyFlow.map(d => d.Receitas),
                        backgroundColor: '#10b981',
                        borderRadius: { topLeft: 4, topRight: 4 },
                        barThickness: 12
                    },
                    {
                        label: 'Despesas',
                        data: monthlyFlow.map(d => d.Despesas),
                        backgroundColor: '#f43f5e',
                        borderRadius: { topLeft: 4, topRight: 4 },
                        barThickness: 12
                    }
                ]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                scales: {
                    y: {
                        beginAtZero: true,
                        grid: { color: gridColor, drawBorder: false },
                        border: { display: false },
                        ticks: {
                            color: textColor,
                            font: { size: 11 },
                            callback: function (value) { return 'R$' + (value >= 1000 ? value / 1000 + 'k' : value); }
                        }
                    },
                    x: {
                        grid: { display: false },
                        border: { display: false },
                        ticks: { color: textColor, font: { size: 11 } }
                    }
                },
                plugins: {
                    legend: { position: 'bottom', labels: { usePointStyle: true, boxWidth: 8, font: { size: 11 }, color: textColor } },
                    tooltip: {
                        callbacks: {
                            label: function (context) { return context.dataset.label + ': ' + formatCurrency(context.raw); }
                        }
                    }
                }
            }
        });
    }
}

// NAVEGAÇÃO ENTRE AS ABAS
// Alterna a visualização entre páginas (Dashboard, Metas, Configurações, Perfil)
function switchView(viewId) {
    // Array interno com todos os IDs de páginas
    const views = ['view-dashboard', 'view-goals', 'view-config', 'view-profile'];
    // Esconde todas as páginas e tira a classe de animação para resetar
    views.forEach(v => {
        const el = document.getElementById(v);
        el.classList.add('hidden');
        el.classList.remove('view-content'); // Reseta a animação
    });
    
    // Exibe apenas a página solicitada
    const targetView = document.getElementById(viewId);
    targetView.classList.remove('hidden');
    // Força o DOM a recalcular para que o CSS de animação rode do zero (fadeUp)
    void targetView.offsetWidth;
    targetView.classList.add('view-content');

    // Atualiza o menu de navegação na parte superior (mostrando qual deles está "ativo" e destacado)
    const navIds = ['nav-dashboard', 'nav-goals', 'nav-config'];
    navIds.forEach(n => {
        const el = document.getElementById(n);
        if (n === 'nav-' + viewId.split('-')[1]) {
            el.className = "nav-link active flex items-center gap-2 px-4 py-2 bg-white dark:bg-slate-700 rounded-full text-sm font-semibold shadow-sm text-slate-800 dark:text-slate-100 transition-colors";
        } else {
            // Estilo inativo
            el.className = "nav-link flex items-center gap-2 px-4 py-2 text-sm font-medium text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200 transition-colors";
        }
    });
    // Se o menu trouxe ícones novos para a tela, eles precisam ser gerados
    lucide.createIcons();
}

// Evento disparado quando o navegador termina de baixar e analisar todo o HTML
document.addEventListener('DOMContentLoaded', () => {
    // 1°. Tenta recuperar os dados gravados no dispositivo do usuário
    loadData();

    // 2°. Configura os botões de Navegação (Cliques)
    document.getElementById('nav-dashboard').addEventListener('click', () => switchView('view-dashboard'));
    document.getElementById('nav-goals').addEventListener('click', () => switchView('view-goals'));
    document.getElementById('nav-config').addEventListener('click', () => switchView('view-config'));
    document.getElementById('nav-profile').addEventListener('click', () => switchView('view-profile'));
    document.getElementById('nav-theme').addEventListener('click', toggleTheme);

    // Transaction form setup
    let currentType = 'expense';
    const btnIncome = document.getElementById('btn-type-income');
    const btnExpense = document.getElementById('btn-type-expense');
    const btnGoal = document.getElementById('btn-type-goal');
    const selectCategory = document.getElementById('form-category');
    const goalSelectorWrapper = document.getElementById('goal-selector-wrapper');
    const formGoalSelect = document.getElementById('form-goal-select');
    const formCategoryWrapper = document.getElementById('form-category-wrapper');
    const form = document.getElementById('transaction-form');

    // Popula o select de metas com as metas existentes em appData
    const updateGoalOptions = () => {
        if (!formGoalSelect) return;
        if (appData.goals.length === 0) {
            formGoalSelect.innerHTML = `<option value="">Nenhuma meta cadastrada</option>`;
        } else {
            formGoalSelect.innerHTML = appData.goals.map(g =>
                `<option value="${g.id}">${g.name} (${formatCurrencyCompact(g.current)} / ${formatCurrencyCompact(g.target)})</option>`
            ).join('');
        }
    };

    const updateCategories = () => {
        const incomeCats = ['Trabalho', 'Investimentos', 'Outros'];
        const expenseCats = ['Alimentação', 'Moradia', 'Trabalho', 'Transporte', 'Saúde', 'Lazer', 'Compras', 'Outros'];
        const cats = currentType === 'income' ? incomeCats : expenseCats;
        selectCategory.innerHTML = cats.map(c => `<option value="${c}">${c}</option>`).join('');
    };

    // Estilos dos botões de tipo (inactive)
    const inactiveBtn = 'flex-1 py-1.5 rounded-lg text-sm font-semibold transition-all shadow-sm text-slate-500 hover:text-slate-700 bg-transparent border border-transparent shadow-none';

    const setType = (type) => {
        currentType = type;

        // Reseta todos os botões primeiro
        btnIncome.className = inactiveBtn;
        btnExpense.className = inactiveBtn;
        btnGoal.className = inactiveBtn;

        // Ativa o botão correto com sua cor
        if (type === 'income') {
            btnIncome.className = 'flex-1 py-1.5 rounded-lg text-sm font-semibold transition-all shadow-sm bg-white dark:bg-slate-700 text-emerald-600 dark:text-emerald-400 border border-slate-200 dark:border-slate-600';
        } else if (type === 'expense') {
            btnExpense.className = 'flex-1 py-1.5 rounded-lg text-sm font-semibold transition-all shadow-sm bg-white dark:bg-slate-700 text-rose-600 dark:text-rose-400 border border-slate-200 dark:border-slate-600';
        } else if (type === 'goal') {
            btnGoal.className = 'flex-1 py-1.5 rounded-lg text-sm font-semibold transition-all shadow-sm bg-white dark:bg-slate-700 text-violet-600 dark:text-violet-400 border border-slate-200 dark:border-slate-600';
        }

        // Mostra/oculta o seletor de metas, a categoria e o campo de descrição
        const descWrapper = document.getElementById('form-desc-wrapper');
        if (type === 'goal') {
            goalSelectorWrapper.classList.remove('hidden');
            formCategoryWrapper.classList.add('hidden');
            if (descWrapper) descWrapper.classList.add('hidden'); // Oculta descrição na Meta
            updateGoalOptions(); // Garante que as metas estejam atualizadas
        } else {
            goalSelectorWrapper.classList.add('hidden');
            formCategoryWrapper.classList.remove('hidden');
            if (descWrapper) descWrapper.classList.remove('hidden'); // Mostra descrição para outros tipos
            updateCategories();
        }
    };

    btnIncome.addEventListener('click', () => setType('income'));
    btnExpense.addEventListener('click', () => setType('expense'));
    btnGoal.addEventListener('click', () => setType('goal'));

    setType('expense');
    document.getElementById('form-date').value = new Date().toISOString().split('T')[0];

    form.addEventListener('submit', (e) => {
        e.preventDefault();
        const amount = parseFloat(document.getElementById('form-amount').value);
        const date = document.getElementById('form-date').value;

        if (isNaN(amount) || amount <= 0) return;

        let newTx;

        if (currentType === 'goal') {
            // --- Lógica de destinação para Meta ---
            // Na Meta, a descrição é gerada automaticamente a partir do nome da meta selecionada
            const selectedGoalId = formGoalSelect.value;
            if (!selectedGoalId) {
                alert('Selecione uma meta para destinar o valor!');
                return;
            }
            const selectedGoal = appData.goals.find(g => g.id === selectedGoalId);
            const autoDesc = selectedGoal ? `Aporte → ${selectedGoal.name}` : 'Aporte em Meta';
            newTx = {
                id: Math.random().toString(36).substr(2, 9),
                description: autoDesc,
                amount,
                type: 'goal',
                goalId: selectedGoalId,
                category: 'Meta',
                date
            };
        } else {
            const desc = document.getElementById('form-desc').value;
            if (!desc) return;
            // --- Lógica padrão: Receita ou Despesa ---
            const category = selectCategory.value;
            newTx = {
                id: Math.random().toString(36).substr(2, 9),
                description: desc,
                amount,
                type: currentType,
                category,
                date
            };
        }

        appData.transactions.unshift(newTx);
        saveData();
        updateDashboard();

        document.getElementById('form-desc').value = '';
        document.getElementById('form-amount').value = '';
    });

    // Edit Transaction Modal Setup
    let currentEditType = 'expense';
    const btnEditIncome = document.getElementById('edit-btn-type-income');
    const btnEditExpense = document.getElementById('edit-btn-type-expense');
    const selectEditCategory = document.getElementById('edit-form-category');
    const editForm = document.getElementById('edit-transaction-form');

    window.updateEditCategories = () => {
        const incomeCats = ['Trabalho', 'Investimentos', 'Outros'];
        const expenseCats = ['Alimentação', 'Moradia', 'Trabalho', 'Transporte', 'Saúde', 'Lazer', 'Compras', 'Outros'];
        const cats = currentEditType === 'income' ? incomeCats : expenseCats;
        if (selectEditCategory) selectEditCategory.innerHTML = cats.map(c => `<option value="${c}">${c}</option>`).join('');
    };

    window.updateEditTypeUI = () => {
        if (!btnEditIncome) return;
        if (currentEditType === 'income') {
            btnEditIncome.className = "flex-1 py-1.5 rounded-lg text-sm font-semibold transition-all shadow-sm bg-white dark:bg-slate-700 text-emerald-600 dark:text-emerald-400 border border-slate-200 dark:border-slate-600";
            btnEditExpense.className = "flex-1 py-1.5 rounded-lg text-sm font-semibold transition-all shadow-sm text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 bg-transparent border border-transparent shadow-none";
        } else {
            btnEditExpense.className = "flex-1 py-1.5 rounded-lg text-sm font-semibold transition-all shadow-sm bg-white dark:bg-slate-700 text-rose-600 dark:text-rose-400 border border-slate-200 dark:border-slate-600";
            btnEditIncome.className = "flex-1 py-1.5 rounded-lg text-sm font-semibold transition-all shadow-sm text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 bg-transparent border border-transparent shadow-none";
        }
    };

    window.setEditType = (type) => {
        currentEditType = type;
        window.updateEditTypeUI();
        window.updateEditCategories();
    };

    if (btnEditIncome && btnEditExpense) {
        btnEditIncome.addEventListener('click', () => setEditType('income'));
        btnEditExpense.addEventListener('click', () => setEditType('expense'));
    }

    if (editForm) {
        editForm.addEventListener('submit', (e) => {
            e.preventDefault();
            const desc = document.getElementById('edit-form-desc').value;
            const amount = parseFloat(document.getElementById('edit-form-amount').value);
            const date = document.getElementById('edit-form-date').value;
            const category = selectEditCategory.value;

            if (!desc || isNaN(amount) || !editingTxId) return;

            const index = appData.transactions.findIndex(t => t.id === editingTxId);
            if (index !== -1) {
                appData.transactions[index] = {
                    ...appData.transactions[index],
                    description: desc,
                    amount,
                    type: currentEditType,
                    category,
                    date
                };
                saveData();
                updateDashboard();
                closeEditModal();
            }
        });
    }

    // 3°. Configurações da página de Perfil. Salva o nome e notifica
    document.getElementById('profile-name').value = appData.user.name;
    document.getElementById('profile-form').addEventListener('submit', (e) => {
        e.preventDefault();
        const newName = document.getElementById('profile-name').value;
        if (newName) {
            appData.user.name = newName;
            saveData();
            updateDashboard();
            alert('Perfil atualizado com sucesso!');
        }
    });

    // 4°. Formulário de Criação de novas Metas
    document.getElementById('goal-form').addEventListener('submit', (e) => {
        e.preventDefault(); // Previne o comportamento padrão que recarregaria a página
        const name = document.getElementById('goal-name').value;
        const icon = document.getElementById('goal-icon').value;
        const target = parseFloat(document.getElementById('goal-target').value);

        if (!name || isNaN(target)) return;

        // Empurra para o array a nova meta
        appData.goals.push({
            id: 'g' + Math.random().toString(36).substr(2, 9),
            name,
            icon,
            target,
            current: 0
        });

        saveData();
        updateDashboard();

        // Reseta os campos de input
        document.getElementById('goal-name').value = '';
        document.getElementById('goal-target').value = '';
    });

    // 5°. Edição de Metas via Modal (Formulário do Modal)
    const editGoalForm = document.getElementById('edit-goal-form');
    if (editGoalForm) {
        editGoalForm.addEventListener('submit', (e) => {
            e.preventDefault();
            const name = document.getElementById('edit-goal-name').value;
            const icon = document.getElementById('edit-goal-icon').value;
            const target = parseFloat(document.getElementById('edit-goal-target').value);

            if (!name || isNaN(target) || !editingGoalId) return;

            const index = appData.goals.findIndex(g => g.id === editingGoalId);
            if (index !== -1) {
                appData.goals[index] = {
                    ...appData.goals[index],
                    name,
                    icon,
                    target
                };
                saveData();
                updateDashboard();
                closeEditGoalModal();
            }
        });
    }

    // Config Setup - Zerar Dados
    // Ao zerar, reinstancia o appData com TODOS os campos necessários (incluindo settings)
    // para evitar que funções como applyTheme() e renderCharts() quebrem por falta de propriedades.
    document.getElementById('btn-clear-data').addEventListener('click', () => {
        if (confirm('Tem certeza absoluta que deseja apagar todos os dados? Isso não pode ser desfeito.')) {
            // Preserva o tema atual para não perder a preferência visual do usuário
            const currentTheme = (appData.settings && appData.settings.theme) ? appData.settings.theme : 'light';

            // Reinicia o appData do zero, mantendo a estrutura completa e obrigatória
            appData = {
                user: { name: '' },
                settings: { theme: currentTheme },
                transactions: [],
                goals: []
            };

            // Limpa o campo de nome no perfil para que o usuário possa inserir um novo
            document.getElementById('profile-name').value = '';

            // Persiste o estado zerado e atualiza toda a interface
            saveData();
            updateDashboard();

            // Redireciona para o Dashboard para o usuário ver o estado limpo
            switchView('view-dashboard');
            alert('Todos os dados foram apagados com sucesso!');
        }
    });

    // Logout shortcut
    document.getElementById('nav-logout').addEventListener('click', () => {
        alert('Aqui seria a função de logout!');
    });

    updateDashboard();
});
