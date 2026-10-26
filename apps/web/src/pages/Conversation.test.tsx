import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { createMockClient } from '../api/client';
import { Conversation } from './Conversation';

const client = createMockClient(0);

describe('Conversa guiada', () => {
  it('mostra o que o usuário disse e confirma o entendimento antes de seguir', async () => {
    render(<Conversation firstText="Quero um hidratante para o rosto de até R$ 20" client={client} onChangeOrder={() => {}} />);
    const log = screen.getByRole('log');
    expect(within(log).getByText(/quero um hidratante/i)).toBeInTheDocument();
    expect(await screen.findByRole('button', { name: 'Está certo' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Mudar' })).toBeInTheDocument();
  });

  it('o resumo do pedido fica visível enquanto a conversa avança', async () => {
    render(<Conversation firstText="hidratante até R$ 20" client={client} onChangeOrder={() => {}} />);
    await screen.findByRole('button', { name: 'Está certo' });
    const summary = screen.getByRole('complementary', { name: 'Seu pedido' });
    expect(within(summary).getByText('hidratante para o rosto')).toBeInTheDocument();
    expect(within(summary).getByText('R$ 20,00')).toBeInTheDocument();
  });

  it('uma pergunta por vez: após confirmar, só as respostas da pergunta atual ficam ativas', async () => {
    render(<Conversation firstText="hidratante" client={client} onChangeOrder={() => {}} />);
    await userEvent.click(await screen.findByRole('button', { name: 'Está certo' }));
    expect(await screen.findByRole('button', { name: 'Seca' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Está certo' })).not.toBeInTheDocument();
  });

  it('o toque numa resposta aparece como fala do usuário e leva às opções', async () => {
    render(<Conversation firstText="hidratante" client={client} onChangeOrder={() => {}} />);
    await userEvent.click(await screen.findByRole('button', { name: 'Está certo' }));
    await userEvent.click(await screen.findByRole('button', { name: 'Seca' }));
    expect(await screen.findByText('Encontrei 2 boas opções para você')).toBeInTheDocument();
    expect(within(screen.getByRole('log')).getByText('Seca')).toBeInTheDocument();
  });

  it('"Mudar" devolve o usuário ao pedido, sem perder o que escreveu', async () => {
    const onChangeOrder = vi.fn();
    render(<Conversation firstText="hidratante" client={client} onChangeOrder={onChangeOrder} />);
    await userEvent.click(await screen.findByRole('button', { name: 'Mudar' }));
    expect(onChangeOrder).toHaveBeenCalledWith('hidratante');
  });

  it('se o motor falhar, explica e oferece tentar de novo', async () => {
    let calls = 0;
    const flaky = {
      async send(input: Parameters<typeof client.send>[0]) {
        if (calls++ === 0) throw new Error('fora do ar');
        return client.send(input);
      },
    };
    render(<Conversation firstText="hidratante" client={flaky} onChangeOrder={() => {}} />);
    await userEvent.click(await screen.findByRole('button', { name: 'Tentar de novo' }));
    expect(await screen.findByRole('button', { name: 'Está certo' })).toBeInTheDocument();
  });

  it('o rodapé "Falar com atendente" está sempre presente', async () => {
    render(<Conversation firstText="hidratante" client={client} onChangeOrder={() => {}} />);
    expect(await screen.findByRole('button', { name: 'Falar com atendente' })).toBeInTheDocument();
  });

  it('o que a pessoa responde entra no painel "Seu pedido"', async () => {
    render(<Conversation firstText="hidratante" client={client} onChangeOrder={() => {}} />);
    await userEvent.click(await screen.findByRole('button', { name: 'Está certo' }));
    await userEvent.click(await screen.findByRole('button', { name: 'Seca' }));
    const summary = screen.getByRole('complementary', { name: 'Seu pedido' });
    expect(within(summary).getByText('Tipo de pele:')).toBeInTheDocument();
    expect(within(summary).getByText('seca')).toBeInTheDocument();
  });

  it('saúde: pergunta, aceita várias respostas e encaminha ao farmacêutico, sem mostrar produto', async () => {
    render(<Conversation firstText="meu pai está com dor de cabeça" client={client} onChangeOrder={() => {}} />);
    await userEvent.click(await screen.findByRole('button', { name: 'Está certo' }));
    await userEvent.click(await screen.findByRole('checkbox', { name: 'Tem pressão alta' }));
    await userEvent.click(screen.getByRole('checkbox', { name: 'Usa outro remédio' }));
    await userEvent.click(screen.getByRole('button', { name: 'Continuar' }));

    expect(await screen.findByRole('region', { name: 'Atenção' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Falar com farmacêutico agora' })).toBeInTheDocument();
    expect(screen.queryByText(/R\$/)).not.toBeInTheDocument();

    const summary = screen.getByRole('complementary', { name: 'Seu pedido' });
    expect(within(summary).getByText('pressão alta')).toBeInTheDocument();
    expect(within(summary).getByText('usa outro remédio')).toBeInTheDocument();
  });

  it('o farmacêutico responde como "informação não confirmada" (honestidade sobre a simulação)', async () => {
    render(<Conversation firstText="quero amoxicilina" client={client} onChangeOrder={() => {}} />);
    await userEvent.click(await screen.findByRole('button', { name: 'Falar com farmacêutico agora' }));
    expect(await screen.findByText(/conexão é simulada/)).toBeInTheDocument();
  });

  it('um novo pedido na mesma conversa não herda as respostas do anterior', async () => {
    render(<Conversation firstText="hidratante" client={client} onChangeOrder={() => {}} />);
    await userEvent.click(await screen.findByRole('button', { name: 'Está certo' }));
    await userEvent.click(await screen.findByRole('button', { name: 'Seca' }));
    expect(within(screen.getByRole('complementary', { name: 'Seu pedido' })).getByText('seca')).toBeInTheDocument();

    await userEvent.type(screen.getByRole('textbox'), 'meu pai está com dor de cabeça{Enter}');
    await screen.findAllByRole('button', { name: 'Está certo' });
    const summary = screen.getByRole('complementary', { name: 'Seu pedido' });
    expect(within(summary).getByText('seu pai')).toBeInTheDocument();
    expect(within(summary).queryByText('seca')).not.toBeInTheDocument();
  });
});
