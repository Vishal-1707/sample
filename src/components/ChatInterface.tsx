
import React, { useState, useEffect, useRef } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Card } from '@/components/ui/card';
import { useToast } from '@/hooks/use-toast';
import { Send, MessageSquare, LogOut, Plus } from 'lucide-react';

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  created_at: string;
}

interface Conversation {
  id: string;
  title: string;
  created_at: string;
  updated_at: string;
}

const ChatInterface = () => {
  const { user, signOut } = useAuth();
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [currentConversation, setCurrentConversation] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [newMessage, setNewMessage] = useState('');
  const [loading, setLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const { toast } = useToast();

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  useEffect(() => {
    if (user) {
      loadConversations();
    }
  }, [user]);

  useEffect(() => {
    if (currentConversation) {
      loadMessages(currentConversation);
    }
  }, [currentConversation]);

  const loadConversations = async () => {
    try {
      const { data, error } = await supabase
        .from('conversations')
        .select('*')
        .order('updated_at', { ascending: false });

      if (error) throw error;
      setConversations(data || []);
    } catch (error) {
      console.error('Error loading conversations:', error);
      toast({
        title: "Error",
        description: "Failed to load conversations",
        variant: "destructive"
      });
    }
  };

  const loadMessages = async (conversationId: string) => {
    try {
      const { data, error } = await supabase
        .from('messages')
        .select('*')
        .eq('conversation_id', conversationId)
        .order('created_at', { ascending: true });

      if (error) throw error;
      
      // Type assertion to ensure role is properly typed
      const typedMessages: Message[] = (data || []).map(msg => ({
        ...msg,
        role: msg.role as 'user' | 'assistant'
      }));
      
      setMessages(typedMessages);
    } catch (error) {
      console.error('Error loading messages:', error);
      toast({
        title: "Error",
        description: "Failed to load messages",
        variant: "destructive"
      });
    }
  };

  const createNewConversation = async () => {
    try {
      const { data, error } = await supabase
        .from('conversations')
        .insert([{ user_id: user?.id, title: 'New Chat' }])
        .select()
        .single();

      if (error) throw error;
      
      setCurrentConversation(data.id);
      setMessages([]);
      await loadConversations();
    } catch (error) {
      console.error('Error creating conversation:', error);
      toast({
        title: "Error",
        description: "Failed to create new conversation",
        variant: "destructive"
      });
    }
  };

  const sendMessage = async () => {
    if (!newMessage.trim() || loading) return;

    let conversationId = currentConversation;
    
    // Create new conversation if none exists
    if (!conversationId) {
      try {
        const { data, error } = await supabase
          .from('conversations')
          .insert([{ user_id: user?.id, title: newMessage.slice(0, 50) + '...' }])
          .select()
          .single();

        if (error) throw error;
        conversationId = data.id;
        setCurrentConversation(conversationId);
        await loadConversations();
      } catch (error) {
        console.error('Error creating conversation:', error);
        toast({
          title: "Error",
          description: "Failed to create conversation",
          variant: "destructive"
        });
        return;
      }
    }

    const userMessage = newMessage;
    setNewMessage('');
    setLoading(true);

    try {
      // Add user message to database
      const { error: userMessageError } = await supabase
        .from('messages')
        .insert([{
          conversation_id: conversationId,
          role: 'user',
          content: userMessage
        }]);

      if (userMessageError) throw userMessageError;

      // Add user message to UI immediately
      const tempUserMessage: Message = {
        id: 'temp-user',
        role: 'user',
        content: userMessage,
        created_at: new Date().toISOString()
      };
      
      setMessages(prev => [...prev, tempUserMessage]);

      // Call AI function
      const { data: aiResponse, error: aiError } = await supabase.functions.invoke('chat-with-ai', {
        body: { message: userMessage }
      });

      if (aiError) throw aiError;

      // Add AI response to database
      const { error: aiMessageError } = await supabase
        .from('messages')
        .insert([{
          conversation_id: conversationId,
          role: 'assistant',
          content: aiResponse.response
        }]);

      if (aiMessageError) throw aiMessageError;

      // Reload messages to get the correct IDs
      await loadMessages(conversationId);

    } catch (error) {
      console.error('Error sending message:', error);
      toast({
        title: "Error",
        description: "Failed to send message",
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  const handleSignOut = async () => {
    await signOut();
  };

  return (
    <div className="flex h-screen bg-gray-100">
      {/* Sidebar */}
      <div className="w-80 bg-gray-900 text-white p-4 flex flex-col">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-xl font-bold">ChatGPT Clone</h1>
          <Button
            variant="ghost"
            size="sm"
            onClick={handleSignOut}
            className="text-white hover:bg-gray-700"
          >
            <LogOut className="h-4 w-4" />
          </Button>
        </div>
        
        <Button
          onClick={createNewConversation}
          className="mb-4 bg-gray-700 hover:bg-gray-600"
        >
          <Plus className="h-4 w-4 mr-2" />
          New Chat
        </Button>

        <div className="flex-1 overflow-y-auto space-y-2">
          {conversations.map((conversation) => (
            <button
              key={conversation.id}
              onClick={() => setCurrentConversation(conversation.id)}
              className={`w-full text-left p-3 rounded hover:bg-gray-700 transition-colors ${
                currentConversation === conversation.id ? 'bg-gray-700' : ''
              }`}
            >
              <div className="flex items-center">
                <MessageSquare className="h-4 w-4 mr-2 flex-shrink-0" />
                <span className="truncate text-sm">{conversation.title}</span>
              </div>
            </button>
          ))}
        </div>

        <div className="mt-4 pt-4 border-t border-gray-600">
          <p className="text-sm text-gray-400">Signed in as:</p>
          <p className="text-sm truncate">{user?.email}</p>
        </div>
      </div>

      {/* Main Chat Area */}
      <div className="flex-1 flex flex-col">
        {/* Messages */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {messages.length === 0 && !currentConversation && (
            <div className="text-center text-gray-500 mt-10">
              <MessageSquare className="h-12 w-12 mx-auto mb-4 text-gray-300" />
              <h2 className="text-xl font-semibold mb-2">Welcome to ChatGPT Clone</h2>
              <p>Start a conversation by typing a message below.</p>
            </div>
          )}
          
          {messages.map((message) => (
            <div
              key={message.id}
              className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}
            >
              <Card className={`max-w-[80%] p-4 ${
                message.role === 'user' 
                  ? 'bg-blue-600 text-white' 
                  : 'bg-white border border-gray-200'
              }`}>
                <div className="whitespace-pre-wrap text-sm">
                  {message.content}
                </div>
              </Card>
            </div>
          ))}
          
          {loading && (
            <div className="flex justify-start">
              <Card className="max-w-[80%] p-4 bg-white border border-gray-200">
                <div className="flex items-center space-x-2">
                  <div className="animate-pulse">AI is thinking...</div>
                </div>
              </Card>
            </div>
          )}
          
          <div ref={messagesEndRef} />
        </div>

        {/* Input Area */}
        <div className="border-t bg-white p-4">
          <div className="flex space-x-2">
            <Textarea
              value={newMessage}
              onChange={(e) => setNewMessage(e.target.value)}
              onKeyPress={handleKeyPress}
              placeholder="Type your message here..."
              className="flex-1 min-h-[60px] max-h-[120px] resize-none"
              disabled={loading}
            />
            <Button 
              onClick={sendMessage} 
              disabled={!newMessage.trim() || loading}
              className="self-end"
            >
              <Send className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ChatInterface;
