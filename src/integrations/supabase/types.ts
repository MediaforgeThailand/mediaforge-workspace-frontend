export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.1"
  }
  public: {
    Tables: {
      affiliate_audit_log: {
        Row: {
          action: string
          actor_id: string | null
          created_at: string | null
          diff: Json | null
          entity_id: string
          entity_type: string
          id: number
        }
        Insert: {
          action: string
          actor_id?: string | null
          created_at?: string | null
          diff?: Json | null
          entity_id: string
          entity_type: string
          id?: number
        }
        Update: {
          action?: string
          actor_id?: string | null
          created_at?: string | null
          diff?: Json | null
          entity_id?: string
          entity_type?: string
          id?: number
        }
        Relationships: []
      }
      angle_prompt_inputs: {
        Row: {
          angle_prompt_id: string
          created_at: string
          description: string | null
          example_url: string | null
          id: string
          input_key: string
          input_type: string
          is_required: boolean
          label: string
          sort_order: number
          updated_at: string
        }
        Insert: {
          angle_prompt_id: string
          created_at?: string
          description?: string | null
          example_url?: string | null
          id?: string
          input_key: string
          input_type?: string
          is_required?: boolean
          label: string
          sort_order?: number
          updated_at?: string
        }
        Update: {
          angle_prompt_id?: string
          created_at?: string
          description?: string | null
          example_url?: string | null
          id?: string
          input_key?: string
          input_type?: string
          is_required?: boolean
          label?: string
          sort_order?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "angle_prompt_inputs_angle_prompt_id_fkey"
            columns: ["angle_prompt_id"]
            isOneToOne: false
            referencedRelation: "angle_prompts"
            referencedColumns: ["id"]
          },
        ]
      }
      angle_prompt_steps: {
        Row: {
          action: string
          angle_prompt_id: string
          config: Json
          created_at: string
          id: string
          input_mapping: Json
          label: string
          step_order: number
          updated_at: string
        }
        Insert: {
          action: string
          angle_prompt_id: string
          config?: Json
          created_at?: string
          id?: string
          input_mapping?: Json
          label: string
          step_order?: number
          updated_at?: string
        }
        Update: {
          action?: string
          angle_prompt_id?: string
          config?: Json
          created_at?: string
          id?: string
          input_mapping?: Json
          label?: string
          step_order?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "angle_prompt_steps_angle_prompt_id_fkey"
            columns: ["angle_prompt_id"]
            isOneToOne: false
            referencedRelation: "angle_prompts"
            referencedColumns: ["id"]
          },
        ]
      }
      angle_prompts: {
        Row: {
          aspect_ratio: string | null
          category: string
          created_at: string
          description: string | null
          duration_seconds: number | null
          estimated_credits: number
          example_media_url: string | null
          example_thumbnail_url: string | null
          feature: string
          flow_type: string
          has_audio: boolean | null
          id: string
          is_active: boolean
          platform: string | null
          prompt_template: string
          sort_order: number | null
          tags: string[] | null
          title: string
          updated_at: string
        }
        Insert: {
          aspect_ratio?: string | null
          category: string
          created_at?: string
          description?: string | null
          duration_seconds?: number | null
          estimated_credits?: number
          example_media_url?: string | null
          example_thumbnail_url?: string | null
          feature: string
          flow_type?: string
          has_audio?: boolean | null
          id?: string
          is_active?: boolean
          platform?: string | null
          prompt_template: string
          sort_order?: number | null
          tags?: string[] | null
          title: string
          updated_at?: string
        }
        Update: {
          aspect_ratio?: string | null
          category?: string
          created_at?: string
          description?: string | null
          duration_seconds?: number | null
          estimated_credits?: number
          example_media_url?: string | null
          example_thumbnail_url?: string | null
          feature?: string
          flow_type?: string
          has_audio?: boolean | null
          id?: string
          is_active?: boolean
          platform?: string | null
          prompt_template?: string
          sort_order?: number | null
          tags?: string[] | null
          title?: string
          updated_at?: string
        }
        Relationships: []
      }
      api_usage_logs: {
        Row: {
          created_at: string
          credits_refunded: number
          credits_used: number
          duration_ms: number | null
          endpoint: string
          error_message: string | null
          feature: string
          id: string
          model: string | null
          request_metadata: Json | null
          status: string
          user_id: string
        }
        Insert: {
          created_at?: string
          credits_refunded?: number
          credits_used?: number
          duration_ms?: number | null
          endpoint: string
          error_message?: string | null
          feature: string
          id?: string
          model?: string | null
          request_metadata?: Json | null
          status?: string
          user_id: string
        }
        Update: {
          created_at?: string
          credits_refunded?: number
          credits_used?: number
          duration_ms?: number | null
          endpoint?: string
          error_message?: string | null
          feature?: string
          id?: string
          model?: string | null
          request_metadata?: Json | null
          status?: string
          user_id?: string
        }
        Relationships: []
      }
      brand_contexts: {
        Row: {
          additional_notes: string | null
          brand_colors: string | null
          brand_tone: string | null
          business_name: string | null
          competitors: string | null
          content_goals: string | null
          created_at: string
          id: string
          industry: string | null
          logo_url: string | null
          preferred_content_types: string[] | null
          primary_platforms: string[] | null
          products_services: string | null
          tagline: string | null
          target_age_range: string | null
          target_audience: string | null
          target_gender: string | null
          target_language: string | null
          target_location: string | null
          unique_selling_points: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          additional_notes?: string | null
          brand_colors?: string | null
          brand_tone?: string | null
          business_name?: string | null
          competitors?: string | null
          content_goals?: string | null
          created_at?: string
          id?: string
          industry?: string | null
          logo_url?: string | null
          preferred_content_types?: string[] | null
          primary_platforms?: string[] | null
          products_services?: string | null
          tagline?: string | null
          target_age_range?: string | null
          target_audience?: string | null
          target_gender?: string | null
          target_language?: string | null
          target_location?: string | null
          unique_selling_points?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          additional_notes?: string | null
          brand_colors?: string | null
          brand_tone?: string | null
          business_name?: string | null
          competitors?: string | null
          content_goals?: string | null
          created_at?: string
          id?: string
          industry?: string | null
          logo_url?: string | null
          preferred_content_types?: string[] | null
          primary_platforms?: string[] | null
          products_services?: string | null
          tagline?: string | null
          target_age_range?: string | null
          target_audience?: string | null
          target_gender?: string | null
          target_language?: string | null
          target_location?: string | null
          unique_selling_points?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      bundle_flows: {
        Row: {
          bundle_id: string
          created_at: string
          flow_id: string
          id: string
          sort_order: number
        }
        Insert: {
          bundle_id: string
          created_at?: string
          flow_id: string
          id?: string
          sort_order?: number
        }
        Update: {
          bundle_id?: string
          created_at?: string
          flow_id?: string
          id?: string
          sort_order?: number
        }
        Relationships: [
          {
            foreignKeyName: "bundle_flows_bundle_id_fkey"
            columns: ["bundle_id"]
            isOneToOne: false
            referencedRelation: "bundles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bundle_flows_flow_id_fkey"
            columns: ["flow_id"]
            isOneToOne: false
            referencedRelation: "flows"
            referencedColumns: ["id"]
          },
        ]
      }
      bundles: {
        Row: {
          categories: string[] | null
          created_at: string
          description: string | null
          embedding: string | null
          format_tags: string[] | null
          id: string
          industry_tags: string[] | null
          is_official: boolean
          keywords: string[] | null
          name: string
          status: string
          tags: string[] | null
          thumbnail_type: string | null
          thumbnail_url: string | null
          updated_at: string
          use_case_tags: string[] | null
          user_id: string
        }
        Insert: {
          categories?: string[] | null
          created_at?: string
          description?: string | null
          embedding?: string | null
          format_tags?: string[] | null
          id?: string
          industry_tags?: string[] | null
          is_official?: boolean
          keywords?: string[] | null
          name?: string
          status?: string
          tags?: string[] | null
          thumbnail_type?: string | null
          thumbnail_url?: string | null
          updated_at?: string
          use_case_tags?: string[] | null
          user_id: string
        }
        Update: {
          categories?: string[] | null
          created_at?: string
          description?: string | null
          embedding?: string | null
          format_tags?: string[] | null
          id?: string
          industry_tags?: string[] | null
          is_official?: boolean
          keywords?: string[] | null
          name?: string
          status?: string
          tags?: string[] | null
          thumbnail_type?: string | null
          thumbnail_url?: string | null
          updated_at?: string
          use_case_tags?: string[] | null
          user_id?: string
        }
        Relationships: []
      }
      cash_wallet_transactions: {
        Row: {
          amount_thb: number
          created_at: string | null
          id: number
          note: string | null
          reference_id: string | null
          tx_type: string
          user_id: string
        }
        Insert: {
          amount_thb: number
          created_at?: string | null
          id?: number
          note?: string | null
          reference_id?: string | null
          tx_type: string
          user_id: string
        }
        Update: {
          amount_thb?: number
          created_at?: string | null
          id?: number
          note?: string | null
          reference_id?: string | null
          tx_type?: string
          user_id?: string
        }
        Relationships: []
      }
      cash_wallet_withdrawals: {
        Row: {
          admin_note: string | null
          amount_thb: number
          approved_at: string | null
          approved_by: string | null
          bank_reference: string | null
          bank_snapshot: Json
          created_at: string
          id: string
          paid_at: string | null
          paid_by: string | null
          rejected_at: string | null
          rejected_by: string | null
          rejection_reason: string | null
          requested_at: string
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          admin_note?: string | null
          amount_thb: number
          approved_at?: string | null
          approved_by?: string | null
          bank_reference?: string | null
          bank_snapshot?: Json
          created_at?: string
          id?: string
          paid_at?: string | null
          paid_by?: string | null
          rejected_at?: string | null
          rejected_by?: string | null
          rejection_reason?: string | null
          requested_at?: string
          status?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          admin_note?: string | null
          amount_thb?: number
          approved_at?: string | null
          approved_by?: string | null
          bank_reference?: string | null
          bank_snapshot?: Json
          created_at?: string
          id?: string
          paid_at?: string | null
          paid_by?: string | null
          rejected_at?: string | null
          rejected_by?: string | null
          rejection_reason?: string | null
          requested_at?: string
          status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      cash_wallets: {
        Row: {
          balance_thb: number
          lifetime_earned: number
          updated_at: string | null
          user_id: string
        }
        Insert: {
          balance_thb?: number
          lifetime_earned?: number
          updated_at?: string | null
          user_id: string
        }
        Update: {
          balance_thb?: number
          lifetime_earned?: number
          updated_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
      chat_conversations: {
        Row: {
          created_at: string
          id: string
          summary: string | null
          summary_message_count: number | null
          title: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          summary?: string | null
          summary_message_count?: number | null
          title?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          summary?: string | null
          summary_message_count?: number | null
          title?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      chat_messages: {
        Row: {
          content: string | null
          conversation_id: string
          created_at: string
          id: string
          images: string[] | null
          metadata: Json | null
          role: string
          user_id: string
          video_status: string | null
          video_url: string | null
        }
        Insert: {
          content?: string | null
          conversation_id: string
          created_at?: string
          id?: string
          images?: string[] | null
          metadata?: Json | null
          role: string
          user_id: string
          video_status?: string | null
          video_url?: string | null
        }
        Update: {
          content?: string | null
          conversation_id?: string
          created_at?: string
          id?: string
          images?: string[] | null
          metadata?: Json | null
          role?: string
          user_id?: string
          video_status?: string | null
          video_url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "chat_messages_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "chat_conversations"
            referencedColumns: ["id"]
          },
        ]
      }
      commission_events: {
        Row: {
          available_at: string | null
          billing_cycle: string | null
          commission_amount_thb: number
          commission_rate: number
          created_at: string | null
          cycle_index: number | null
          gross_amount_thb: number
          hold_until: string
          id: string
          net_amount_thb: number
          paid_at: string | null
          partner_user_id: string
          payout_id: string | null
          referral_id: string
          referred_user_id: string
          reversal_reason: string | null
          reversed_at: string | null
          reversed_by_refund_id: string | null
          status: string
          stripe_invoice_id: string | null
          stripe_payment_intent_id: string | null
        }
        Insert: {
          available_at?: string | null
          billing_cycle?: string | null
          commission_amount_thb: number
          commission_rate: number
          created_at?: string | null
          cycle_index?: number | null
          gross_amount_thb: number
          hold_until: string
          id?: string
          net_amount_thb: number
          paid_at?: string | null
          partner_user_id: string
          payout_id?: string | null
          referral_id: string
          referred_user_id: string
          reversal_reason?: string | null
          reversed_at?: string | null
          reversed_by_refund_id?: string | null
          status?: string
          stripe_invoice_id?: string | null
          stripe_payment_intent_id?: string | null
        }
        Update: {
          available_at?: string | null
          billing_cycle?: string | null
          commission_amount_thb?: number
          commission_rate?: number
          created_at?: string | null
          cycle_index?: number | null
          gross_amount_thb?: number
          hold_until?: string
          id?: string
          net_amount_thb?: number
          paid_at?: string | null
          partner_user_id?: string
          payout_id?: string | null
          referral_id?: string
          referred_user_id?: string
          reversal_reason?: string | null
          reversed_at?: string | null
          reversed_by_refund_id?: string | null
          status?: string
          stripe_invoice_id?: string | null
          stripe_payment_intent_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "commission_events_partner_user_id_fkey"
            columns: ["partner_user_id"]
            isOneToOne: false
            referencedRelation: "partners"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "commission_events_referral_id_fkey"
            columns: ["referral_id"]
            isOneToOne: false
            referencedRelation: "referrals"
            referencedColumns: ["id"]
          },
        ]
      }
      community_comments: {
        Row: {
          content: string
          created_at: string
          id: string
          post_id: string
          user_id: string
        }
        Insert: {
          content: string
          created_at?: string
          id?: string
          post_id: string
          user_id: string
        }
        Update: {
          content?: string
          created_at?: string
          id?: string
          post_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "community_comments_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "community_posts"
            referencedColumns: ["id"]
          },
        ]
      }
      community_likes: {
        Row: {
          created_at: string
          id: string
          post_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          post_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          post_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "community_likes_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "community_posts"
            referencedColumns: ["id"]
          },
        ]
      }
      community_posts: {
        Row: {
          comments_count: number
          created_at: string
          description: string | null
          id: string
          likes_count: number
          media_type: string
          media_url: string
          prompt: string | null
          thumbnail_url: string | null
          title: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          comments_count?: number
          created_at?: string
          description?: string | null
          id?: string
          likes_count?: number
          media_type?: string
          media_url: string
          prompt?: string | null
          thumbnail_url?: string | null
          title?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          comments_count?: number
          created_at?: string
          description?: string | null
          id?: string
          likes_count?: number
          media_type?: string
          media_url?: string
          prompt?: string | null
          thumbnail_url?: string | null
          title?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      copilot_system_prompts: {
        Row: {
          created_at: string
          feature: string
          id: string
          is_active: boolean
          label: string
          model: string
          system_prompt: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          feature: string
          id?: string
          is_active?: boolean
          label: string
          model?: string
          system_prompt: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          feature?: string
          id?: string
          is_active?: boolean
          label?: string
          model?: string
          system_prompt?: string
          updated_at?: string
        }
        Relationships: []
      }
      credit_batches: {
        Row: {
          amount: number
          created_at: string
          expires_at: string
          id: string
          reference_id: string | null
          remaining: number
          source_type: string
          user_id: string
        }
        Insert: {
          amount: number
          created_at?: string
          expires_at: string
          id?: string
          reference_id?: string | null
          remaining: number
          source_type?: string
          user_id: string
        }
        Update: {
          amount?: number
          created_at?: string
          expires_at?: string
          id?: string
          reference_id?: string | null
          remaining?: number
          source_type?: string
          user_id?: string
        }
        Relationships: []
      }
      credit_costs: {
        Row: {
          cost: number
          created_at: string
          duration_seconds: number | null
          feature: string
          has_audio: boolean | null
          id: string
          label: string
          model: string | null
          pricing_type: string | null
        }
        Insert: {
          cost: number
          created_at?: string
          duration_seconds?: number | null
          feature: string
          has_audio?: boolean | null
          id?: string
          label: string
          model?: string | null
          pricing_type?: string | null
        }
        Update: {
          cost?: number
          created_at?: string
          duration_seconds?: number | null
          feature?: string
          has_audio?: boolean | null
          id?: string
          label?: string
          model?: string | null
          pricing_type?: string | null
        }
        Relationships: []
      }
      credit_packages: {
        Row: {
          annual_discount_percent: number | null
          created_at: string
          credits: number
          id: string
          is_active: boolean
          is_popular: boolean
          name: string
          price_thb: number
          sort_order: number
          stripe_price_id: string | null
          stripe_price_id_annual: string | null
          stripe_price_id_monthly: string | null
          stripe_product_id: string | null
        }
        Insert: {
          annual_discount_percent?: number | null
          created_at?: string
          credits: number
          id?: string
          is_active?: boolean
          is_popular?: boolean
          name: string
          price_thb: number
          sort_order?: number
          stripe_price_id?: string | null
          stripe_price_id_annual?: string | null
          stripe_price_id_monthly?: string | null
          stripe_product_id?: string | null
        }
        Update: {
          annual_discount_percent?: number | null
          created_at?: string
          credits?: number
          id?: string
          is_active?: boolean
          is_popular?: boolean
          name?: string
          price_thb?: number
          sort_order?: number
          stripe_price_id?: string | null
          stripe_price_id_annual?: string | null
          stripe_price_id_monthly?: string | null
          stripe_product_id?: string | null
        }
        Relationships: []
      }
      credit_transactions: {
        Row: {
          amount: number
          balance_after: number
          created_at: string
          description: string | null
          feature: string | null
          id: string
          reference_id: string | null
          type: string
          user_id: string
        }
        Insert: {
          amount: number
          balance_after?: number
          created_at?: string
          description?: string | null
          feature?: string | null
          id?: string
          reference_id?: string | null
          type: string
          user_id: string
        }
        Update: {
          amount?: number
          balance_after?: number
          created_at?: string
          description?: string | null
          feature?: string | null
          id?: string
          reference_id?: string | null
          type?: string
          user_id?: string
        }
        Relationships: []
      }
      demo_budget: {
        Row: {
          id: string
          max_monthly_credits: number
          month: string
          total_credits_granted: number
          updated_at: string
        }
        Insert: {
          id?: string
          max_monthly_credits?: number
          month: string
          total_credits_granted?: number
          updated_at?: string
        }
        Update: {
          id?: string
          max_monthly_credits?: number
          month?: string
          total_credits_granted?: number
          updated_at?: string
        }
        Relationships: []
      }
      demo_links: {
        Row: {
          created_at: string
          created_by: string | null
          credits_budget: number
          expires_at: string
          id: string
          is_active: boolean
          notes: string | null
          redeemed_at: string | null
          redeemed_by: string | null
          token: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          credits_budget?: number
          expires_at: string
          id?: string
          is_active?: boolean
          notes?: string | null
          redeemed_at?: string | null
          redeemed_by?: string | null
          token: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          credits_budget?: number
          expires_at?: string
          id?: string
          is_active?: boolean
          notes?: string | null
          redeemed_at?: string | null
          redeemed_by?: string | null
          token?: string
        }
        Relationships: []
      }
      email_send_log: {
        Row: {
          created_at: string
          error_message: string | null
          id: string
          message_id: string | null
          metadata: Json | null
          recipient_email: string
          status: string
          template_name: string
        }
        Insert: {
          created_at?: string
          error_message?: string | null
          id?: string
          message_id?: string | null
          metadata?: Json | null
          recipient_email: string
          status: string
          template_name: string
        }
        Update: {
          created_at?: string
          error_message?: string | null
          id?: string
          message_id?: string | null
          metadata?: Json | null
          recipient_email?: string
          status?: string
          template_name?: string
        }
        Relationships: []
      }
      email_send_state: {
        Row: {
          auth_email_ttl_minutes: number
          batch_size: number
          id: number
          retry_after_until: string | null
          send_delay_ms: number
          transactional_email_ttl_minutes: number
          updated_at: string
        }
        Insert: {
          auth_email_ttl_minutes?: number
          batch_size?: number
          id?: number
          retry_after_until?: string | null
          send_delay_ms?: number
          transactional_email_ttl_minutes?: number
          updated_at?: string
        }
        Update: {
          auth_email_ttl_minutes?: number
          batch_size?: number
          id?: number
          retry_after_until?: string | null
          send_delay_ms?: number
          transactional_email_ttl_minutes?: number
          updated_at?: string
        }
        Relationships: []
      }
      email_unsubscribe_tokens: {
        Row: {
          created_at: string
          email: string
          id: string
          token: string
          used_at: string | null
        }
        Insert: {
          created_at?: string
          email: string
          id?: string
          token: string
          used_at?: string | null
        }
        Update: {
          created_at?: string
          email?: string
          id?: string
          token?: string
          used_at?: string | null
        }
        Relationships: []
      }
      flow_badges: {
        Row: {
          assigned_by: string
          badge: string
          created_at: string
          flow_id: string
          id: string
        }
        Insert: {
          assigned_by: string
          badge: string
          created_at?: string
          flow_id: string
          id?: string
        }
        Update: {
          assigned_by?: string
          badge?: string
          created_at?: string
          flow_id?: string
          id?: string
        }
        Relationships: [
          {
            foreignKeyName: "flow_badges_flow_id_fkey"
            columns: ["flow_id"]
            isOneToOne: false
            referencedRelation: "flows"
            referencedColumns: ["id"]
          },
        ]
      }
      flow_categories: {
        Row: {
          category_group: string
          created_at: string
          description: string | null
          icon: string | null
          id: string
          is_active: boolean
          name: string
          slug: string
          sort_order: number
          updated_at: string
        }
        Insert: {
          category_group: string
          created_at?: string
          description?: string | null
          icon?: string | null
          id?: string
          is_active?: boolean
          name: string
          slug: string
          sort_order?: number
          updated_at?: string
        }
        Update: {
          category_group?: string
          created_at?: string
          description?: string | null
          icon?: string | null
          id?: string
          is_active?: boolean
          name?: string
          slug?: string
          sort_order?: number
          updated_at?: string
        }
        Relationships: []
      }
      flow_category_mappings: {
        Row: {
          category_id: string
          created_at: string
          flow_id: string
          id: string
        }
        Insert: {
          category_id: string
          created_at?: string
          flow_id: string
          id?: string
        }
        Update: {
          category_id?: string
          created_at?: string
          flow_id?: string
          id?: string
        }
        Relationships: [
          {
            foreignKeyName: "flow_category_mappings_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "flow_categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "flow_category_mappings_flow_id_fkey"
            columns: ["flow_id"]
            isOneToOne: false
            referencedRelation: "flows"
            referencedColumns: ["id"]
          },
        ]
      }
      flow_metrics: {
        Row: {
          avg_rating: number | null
          flow_id: string
          last_run_at: string | null
          total_revenue: number
          total_runs: number
          updated_at: string
        }
        Insert: {
          avg_rating?: number | null
          flow_id: string
          last_run_at?: string | null
          total_revenue?: number
          total_runs?: number
          updated_at?: string
        }
        Update: {
          avg_rating?: number | null
          flow_id?: string
          last_run_at?: string | null
          total_revenue?: number
          total_runs?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "flow_metrics_flow_id_fkey"
            columns: ["flow_id"]
            isOneToOne: true
            referencedRelation: "flows"
            referencedColumns: ["id"]
          },
        ]
      }
      flow_nodes: {
        Row: {
          config: Json
          created_at: string
          flow_id: string
          height: number | null
          id: string
          label: string
          node_type: string
          position_x: number
          position_y: number
          sort_order: number
          updated_at: string
          width: number | null
        }
        Insert: {
          config?: Json
          created_at?: string
          flow_id: string
          height?: number | null
          id?: string
          label?: string
          node_type: string
          position_x?: number
          position_y?: number
          sort_order?: number
          updated_at?: string
          width?: number | null
        }
        Update: {
          config?: Json
          created_at?: string
          flow_id?: string
          height?: number | null
          id?: string
          label?: string
          node_type?: string
          position_x?: number
          position_y?: number
          sort_order?: number
          updated_at?: string
          width?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "flow_nodes_flow_id_fkey"
            columns: ["flow_id"]
            isOneToOne: false
            referencedRelation: "flows"
            referencedColumns: ["id"]
          },
        ]
      }
      flow_reviews: {
        Row: {
          commercial_usability: number
          consistency: number
          created_at: string
          decision: string
          efficiency: number
          flow_id: string
          id: string
          internal_notes: string | null
          originality: number
          output_quality: number
          reviewer_id: string
          reviewer_notes: string | null
          safety: number
          total_score: number | null
          workflow_clarity: number
        }
        Insert: {
          commercial_usability?: number
          consistency?: number
          created_at?: string
          decision?: string
          efficiency?: number
          flow_id: string
          id?: string
          internal_notes?: string | null
          originality?: number
          output_quality?: number
          reviewer_id: string
          reviewer_notes?: string | null
          safety?: number
          total_score?: number | null
          workflow_clarity?: number
        }
        Update: {
          commercial_usability?: number
          consistency?: number
          created_at?: string
          decision?: string
          efficiency?: number
          flow_id?: string
          id?: string
          internal_notes?: string | null
          originality?: number
          output_quality?: number
          reviewer_id?: string
          reviewer_notes?: string | null
          safety?: number
          total_score?: number | null
          workflow_clarity?: number
        }
        Relationships: [
          {
            foreignKeyName: "flow_reviews_flow_id_fkey"
            columns: ["flow_id"]
            isOneToOne: false
            referencedRelation: "flows"
            referencedColumns: ["id"]
          },
        ]
      }
      flow_runs: {
        Row: {
          completed_at: string | null
          credits_used: number
          dismissed_at: string | null
          duration_ms: number | null
          error_message: string | null
          flow_id: string
          id: string
          inputs: Json
          outputs: Json | null
          started_at: string
          status: string
          user_id: string
          version: number
        }
        Insert: {
          completed_at?: string | null
          credits_used?: number
          dismissed_at?: string | null
          duration_ms?: number | null
          error_message?: string | null
          flow_id: string
          id?: string
          inputs?: Json
          outputs?: Json | null
          started_at?: string
          status?: string
          user_id: string
          version?: number
        }
        Update: {
          completed_at?: string | null
          credits_used?: number
          dismissed_at?: string | null
          duration_ms?: number | null
          error_message?: string | null
          flow_id?: string
          id?: string
          inputs?: Json
          outputs?: Json | null
          started_at?: string
          status?: string
          user_id?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "flow_runs_flow_id_fkey"
            columns: ["flow_id"]
            isOneToOne: false
            referencedRelation: "flows"
            referencedColumns: ["id"]
          },
        ]
      }
      flow_test_runs: {
        Row: {
          created_at: string
          duration_ms: number | null
          error_message: string | null
          flow_id: string
          id: string
          inputs: Json
          node_id: string | null
          outputs: Json | null
          status: string
          user_id: string
        }
        Insert: {
          created_at?: string
          duration_ms?: number | null
          error_message?: string | null
          flow_id: string
          id?: string
          inputs?: Json
          node_id?: string | null
          outputs?: Json | null
          status?: string
          user_id: string
        }
        Update: {
          created_at?: string
          duration_ms?: number | null
          error_message?: string | null
          flow_id?: string
          id?: string
          inputs?: Json
          node_id?: string | null
          outputs?: Json | null
          status?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "flow_test_runs_flow_id_fkey"
            columns: ["flow_id"]
            isOneToOne: false
            referencedRelation: "flows"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "flow_test_runs_node_id_fkey"
            columns: ["node_id"]
            isOneToOne: false
            referencedRelation: "flow_nodes"
            referencedColumns: ["id"]
          },
        ]
      }
      flow_user_reviews: {
        Row: {
          cashback_credits: number
          cashback_granted: boolean
          comment: string | null
          created_at: string
          flow_id: string
          flow_run_id: string
          id: string
          rating: number
          user_id: string
        }
        Insert: {
          cashback_credits?: number
          cashback_granted?: boolean
          comment?: string | null
          created_at?: string
          flow_id: string
          flow_run_id: string
          id?: string
          rating: number
          user_id: string
        }
        Update: {
          cashback_credits?: number
          cashback_granted?: boolean
          comment?: string | null
          created_at?: string
          flow_id?: string
          flow_run_id?: string
          id?: string
          rating?: number
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "flow_user_reviews_flow_id_fkey"
            columns: ["flow_id"]
            isOneToOne: false
            referencedRelation: "flows"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "flow_user_reviews_flow_run_id_fkey"
            columns: ["flow_run_id"]
            isOneToOne: false
            referencedRelation: "flow_runs"
            referencedColumns: ["id"]
          },
        ]
      }
      flow_versions: {
        Row: {
          change_note: string | null
          created_at: string
          created_by: string
          flow_id: string
          id: string
          snapshot: Json
          version: number
        }
        Insert: {
          change_note?: string | null
          created_at?: string
          created_by: string
          flow_id: string
          id?: string
          snapshot?: Json
          version?: number
        }
        Update: {
          change_note?: string | null
          created_at?: string
          created_by?: string
          flow_id?: string
          id?: string
          snapshot?: Json
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "flow_versions_flow_id_fkey"
            columns: ["flow_id"]
            isOneToOne: false
            referencedRelation: "flows"
            referencedColumns: ["id"]
          },
        ]
      }
      flows: {
        Row: {
          api_cost: number
          base_cost: number
          categories: string[] | null
          category: string
          contribution_margin: number
          created_at: string
          creator_payout: number
          current_version: number
          description: string | null
          embedding: string | null
          format_tags: string[] | null
          id: string
          industry_tags: string[] | null
          is_official: boolean
          keywords: string[] | null
          markup_multiplier: number
          markup_multiplier_override: number | null
          name: string
          performance_bonus_percent: number
          selling_price: number
          settings: Json
          status: string
          tags: string[] | null
          thumbnail_url: string | null
          updated_at: string
          use_case_tags: string[] | null
          user_id: string
        }
        Insert: {
          api_cost?: number
          base_cost?: number
          categories?: string[] | null
          category?: string
          contribution_margin?: number
          created_at?: string
          creator_payout?: number
          current_version?: number
          description?: string | null
          embedding?: string | null
          format_tags?: string[] | null
          id?: string
          industry_tags?: string[] | null
          is_official?: boolean
          keywords?: string[] | null
          markup_multiplier?: number
          markup_multiplier_override?: number | null
          name?: string
          performance_bonus_percent?: number
          selling_price?: number
          settings?: Json
          status?: string
          tags?: string[] | null
          thumbnail_url?: string | null
          updated_at?: string
          use_case_tags?: string[] | null
          user_id: string
        }
        Update: {
          api_cost?: number
          base_cost?: number
          categories?: string[] | null
          category?: string
          contribution_margin?: number
          created_at?: string
          creator_payout?: number
          current_version?: number
          description?: string | null
          embedding?: string | null
          format_tags?: string[] | null
          id?: string
          industry_tags?: string[] | null
          is_official?: boolean
          keywords?: string[] | null
          markup_multiplier?: number
          markup_multiplier_override?: number | null
          name?: string
          performance_bonus_percent?: number
          selling_price?: number
          settings?: Json
          status?: string
          tags?: string[] | null
          thumbnail_url?: string | null
          updated_at?: string
          use_case_tags?: string[] | null
          user_id?: string
        }
        Relationships: []
      }
      fraud_flags: {
        Row: {
          action_taken: string | null
          actioned_at: string | null
          actioned_by: string | null
          created_at: string
          details: Json
          id: string
          kind: string
          partner_id: string | null
          payment_intent_id: string | null
          referred_user_id: string | null
          severity: string
          status: string
        }
        Insert: {
          action_taken?: string | null
          actioned_at?: string | null
          actioned_by?: string | null
          created_at?: string
          details?: Json
          id?: string
          kind: string
          partner_id?: string | null
          payment_intent_id?: string | null
          referred_user_id?: string | null
          severity?: string
          status?: string
        }
        Update: {
          action_taken?: string | null
          actioned_at?: string | null
          actioned_by?: string | null
          created_at?: string
          details?: Json
          id?: string
          kind?: string
          partner_id?: string | null
          payment_intent_id?: string | null
          referred_user_id?: string | null
          severity?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "fraud_flags_partner_id_fkey"
            columns: ["partner_id"]
            isOneToOne: false
            referencedRelation: "partners"
            referencedColumns: ["user_id"]
          },
        ]
      }
      homepage_featured: {
        Row: {
          created_at: string
          flow_id: string
          id: string
          is_active: boolean
          section_id: string | null
          slot: string
          sort_order: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          flow_id: string
          id?: string
          is_active?: boolean
          section_id?: string | null
          slot?: string
          sort_order?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          flow_id?: string
          id?: string
          is_active?: boolean
          section_id?: string | null
          slot?: string
          sort_order?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "homepage_featured_flow_id_fkey"
            columns: ["flow_id"]
            isOneToOne: false
            referencedRelation: "flows"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "homepage_featured_section_id_fkey"
            columns: ["section_id"]
            isOneToOne: false
            referencedRelation: "homepage_sections"
            referencedColumns: ["id"]
          },
        ]
      }
      homepage_sections: {
        Row: {
          auto_fill_strategy: string
          created_at: string
          icon: string
          id: string
          is_active: boolean
          max_items: number
          section_type: string
          sort_order: number
          subtitle: string | null
          title: string
          updated_at: string
        }
        Insert: {
          auto_fill_strategy?: string
          created_at?: string
          icon?: string
          id?: string
          is_active?: boolean
          max_items?: number
          section_type?: string
          sort_order?: number
          subtitle?: string | null
          title: string
          updated_at?: string
        }
        Update: {
          auto_fill_strategy?: string
          created_at?: string
          icon?: string
          id?: string
          is_active?: boolean
          max_items?: number
          section_type?: string
          sort_order?: number
          subtitle?: string | null
          title?: string
          updated_at?: string
        }
        Relationships: []
      }
      notifications: {
        Row: {
          created_at: string
          icon: string | null
          id: string
          is_read: boolean
          link: string | null
          message: string | null
          metadata: Json | null
          title: string
          type: string
          user_id: string
        }
        Insert: {
          created_at?: string
          icon?: string | null
          id?: string
          is_read?: boolean
          link?: string | null
          message?: string | null
          metadata?: Json | null
          title: string
          type?: string
          user_id: string
        }
        Update: {
          created_at?: string
          icon?: string | null
          id?: string
          is_read?: boolean
          link?: string | null
          message?: string | null
          metadata?: Json | null
          title?: string
          type?: string
          user_id?: string
        }
        Relationships: []
      }
      partner_admin_notes: {
        Row: {
          author_id: string
          created_at: string
          id: string
          note: string
          partner_user_id: string
          updated_at: string
          visibility: string
        }
        Insert: {
          author_id: string
          created_at?: string
          id?: string
          note: string
          partner_user_id: string
          updated_at?: string
          visibility?: string
        }
        Update: {
          author_id?: string
          created_at?: string
          id?: string
          note?: string
          partner_user_id?: string
          updated_at?: string
          visibility?: string
        }
        Relationships: [
          {
            foreignKeyName: "partner_admin_notes_partner_user_id_fkey"
            columns: ["partner_user_id"]
            isOneToOne: false
            referencedRelation: "partners"
            referencedColumns: ["user_id"]
          },
        ]
      }
      partner_applications: {
        Row: {
          address_line1: string | null
          address_line2: string | null
          bank_account_name: string
          bank_account_no: string
          bank_book_url: string
          bank_name: string
          city: string | null
          country_code: string | null
          created_at: string | null
          follower_count: number | null
          id: string
          id_card_back_url: string | null
          id_card_front_url: string
          legal_first_name: string
          legal_last_name: string
          national_id: string
          needs_info_message: string | null
          phone_e164: string
          postal_code: string | null
          rejection_reason: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          selfie_with_id_url: string | null
          social_platform: string | null
          social_profile_url: string | null
          status: string
          submitted_at: string | null
          updated_at: string | null
          user_id: string
        }
        Insert: {
          address_line1?: string | null
          address_line2?: string | null
          bank_account_name: string
          bank_account_no: string
          bank_book_url: string
          bank_name: string
          city?: string | null
          country_code?: string | null
          created_at?: string | null
          follower_count?: number | null
          id?: string
          id_card_back_url?: string | null
          id_card_front_url: string
          legal_first_name: string
          legal_last_name: string
          national_id: string
          needs_info_message?: string | null
          phone_e164: string
          postal_code?: string | null
          rejection_reason?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          selfie_with_id_url?: string | null
          social_platform?: string | null
          social_profile_url?: string | null
          status?: string
          submitted_at?: string | null
          updated_at?: string | null
          user_id: string
        }
        Update: {
          address_line1?: string | null
          address_line2?: string | null
          bank_account_name?: string
          bank_account_no?: string
          bank_book_url?: string
          bank_name?: string
          city?: string | null
          country_code?: string | null
          created_at?: string | null
          follower_count?: number | null
          id?: string
          id_card_back_url?: string | null
          id_card_front_url?: string
          legal_first_name?: string
          legal_last_name?: string
          national_id?: string
          needs_info_message?: string | null
          phone_e164?: string
          postal_code?: string | null
          rejection_reason?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          selfie_with_id_url?: string | null
          social_platform?: string | null
          social_profile_url?: string | null
          status?: string
          submitted_at?: string | null
          updated_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
      partner_leads: {
        Row: {
          company: string | null
          created_at: string
          email: string
          id: string
          name: string
          status: string
          use_case: string
          user_id: string | null
        }
        Insert: {
          company?: string | null
          created_at?: string
          email: string
          id?: string
          name: string
          status?: string
          use_case: string
          user_id?: string | null
        }
        Update: {
          company?: string | null
          created_at?: string
          email?: string
          id?: string
          name?: string
          status?: string
          use_case?: string
          user_id?: string | null
        }
        Relationships: []
      }
      partners: {
        Row: {
          application_id: string
          approved_at: string
          commission_rate: number
          created_at: string | null
          lifetime_commission_thb: number | null
          lifetime_paid_thb: number | null
          suspended_at: string | null
          suspended_reason: string | null
          tier: string | null
          tier_override_expires_at: string | null
          tier_override_reason: string | null
          tier_override_set_at: string | null
          tier_override_set_by: string | null
          user_id: string
        }
        Insert: {
          application_id: string
          approved_at: string
          commission_rate?: number
          created_at?: string | null
          lifetime_commission_thb?: number | null
          lifetime_paid_thb?: number | null
          suspended_at?: string | null
          suspended_reason?: string | null
          tier?: string | null
          tier_override_expires_at?: string | null
          tier_override_reason?: string | null
          tier_override_set_at?: string | null
          tier_override_set_by?: string | null
          user_id: string
        }
        Update: {
          application_id?: string
          approved_at?: string
          commission_rate?: number
          created_at?: string | null
          lifetime_commission_thb?: number | null
          lifetime_paid_thb?: number | null
          suspended_at?: string | null
          suspended_reason?: string | null
          tier?: string | null
          tier_override_expires_at?: string | null
          tier_override_reason?: string | null
          tier_override_set_at?: string | null
          tier_override_set_by?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "partners_application_id_fkey"
            columns: ["application_id"]
            isOneToOne: false
            referencedRelation: "partner_applications"
            referencedColumns: ["id"]
          },
        ]
      }
      payment_transactions: {
        Row: {
          amount_thb: number
          created_at: string
          credits_added: number
          id: string
          package_id: string | null
          payment_method: string | null
          refund_amount_thb: number | null
          refund_reason: string | null
          refunded_at: string | null
          status: string
          stripe_payment_intent_id: string | null
          stripe_refund_id: string | null
          stripe_session_id: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          amount_thb: number
          created_at?: string
          credits_added?: number
          id?: string
          package_id?: string | null
          payment_method?: string | null
          refund_amount_thb?: number | null
          refund_reason?: string | null
          refunded_at?: string | null
          status?: string
          stripe_payment_intent_id?: string | null
          stripe_refund_id?: string | null
          stripe_session_id?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          amount_thb?: number
          created_at?: string
          credits_added?: number
          id?: string
          package_id?: string | null
          payment_method?: string | null
          refund_amount_thb?: number | null
          refund_reason?: string | null
          refunded_at?: string | null
          status?: string
          stripe_payment_intent_id?: string | null
          stripe_refund_id?: string | null
          stripe_session_id?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "payment_transactions_package_id_fkey"
            columns: ["package_id"]
            isOneToOne: false
            referencedRelation: "credit_packages"
            referencedColumns: ["id"]
          },
        ]
      }
      payout_requests: {
        Row: {
          amount_thb: number
          approved_at: string | null
          approved_by: string | null
          bank_reference: string | null
          bank_snapshot: Json
          commission_ids: string[]
          failure_reason: string | null
          id: string
          metadata: Json
          notes: string | null
          paid_at: string | null
          paid_by: string | null
          partner_user_id: string
          processed_at: string | null
          processed_by: string | null
          proof_url: string | null
          rejected_at: string | null
          rejected_by: string | null
          rejection_reason: string | null
          requested_at: string | null
          status: string
        }
        Insert: {
          amount_thb: number
          approved_at?: string | null
          approved_by?: string | null
          bank_reference?: string | null
          bank_snapshot: Json
          commission_ids: string[]
          failure_reason?: string | null
          id?: string
          metadata?: Json
          notes?: string | null
          paid_at?: string | null
          paid_by?: string | null
          partner_user_id: string
          processed_at?: string | null
          processed_by?: string | null
          proof_url?: string | null
          rejected_at?: string | null
          rejected_by?: string | null
          rejection_reason?: string | null
          requested_at?: string | null
          status?: string
        }
        Update: {
          amount_thb?: number
          approved_at?: string | null
          approved_by?: string | null
          bank_reference?: string | null
          bank_snapshot?: Json
          commission_ids?: string[]
          failure_reason?: string | null
          id?: string
          metadata?: Json
          notes?: string | null
          paid_at?: string | null
          paid_by?: string | null
          partner_user_id?: string
          processed_at?: string | null
          processed_by?: string | null
          proof_url?: string | null
          rejected_at?: string | null
          rejected_by?: string | null
          rejection_reason?: string | null
          requested_at?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "payout_requests_paid_by_fkey"
            columns: ["paid_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payout_requests_partner_user_id_fkey"
            columns: ["partner_user_id"]
            isOneToOne: false
            referencedRelation: "partners"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "payout_requests_rejected_by_fkey"
            columns: ["rejected_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      phone_otps: {
        Row: {
          attempts: number
          code_hash: string
          created_at: string
          expires_at: string
          id: string
          max_attempts: number
          phone: string
          verified: boolean
        }
        Insert: {
          attempts?: number
          code_hash: string
          created_at?: string
          expires_at: string
          id?: string
          max_attempts?: number
          phone: string
          verified?: boolean
        }
        Update: {
          attempts?: number
          code_hash?: string
          created_at?: string
          expires_at?: string
          id?: string
          max_attempts?: number
          phone?: string
          verified?: boolean
        }
        Relationships: []
      }
      pipeline_executions: {
        Row: {
          created_at: string
          credits_deducted: number
          current_step: number
          error_message: string | null
          flow_id: string
          flow_run_id: string | null
          id: string
          pricing_info: Json
          status: string
          step_results: Json
          steps: Json
          total_steps: number
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          credits_deducted?: number
          current_step?: number
          error_message?: string | null
          flow_id: string
          flow_run_id?: string | null
          id?: string
          pricing_info?: Json
          status?: string
          step_results?: Json
          steps?: Json
          total_steps?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          credits_deducted?: number
          current_step?: number
          error_message?: string | null
          flow_id?: string
          flow_run_id?: string | null
          id?: string
          pricing_info?: Json
          status?: string
          step_results?: Json
          steps?: Json
          total_steps?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "pipeline_executions_flow_id_fkey"
            columns: ["flow_id"]
            isOneToOne: false
            referencedRelation: "flows"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pipeline_executions_flow_run_id_fkey"
            columns: ["flow_run_id"]
            isOneToOne: false
            referencedRelation: "flow_runs"
            referencedColumns: ["id"]
          },
        ]
      }
      preset_sections: {
        Row: {
          created_at: string
          icon: string
          id: string
          is_active: boolean
          key: string
          label: string
          sort_order: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          icon?: string
          id?: string
          is_active?: boolean
          key: string
          label: string
          sort_order?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          icon?: string
          id?: string
          is_active?: boolean
          key?: string
          label?: string
          sort_order?: number
          updated_at?: string
        }
        Relationships: []
      }
      presets: {
        Row: {
          category: string
          created_at: string
          description: string | null
          id: string
          is_active: boolean
          prompt: string
          section: string
          sort_order: number
          tag: string | null
          thumbnail_url: string | null
          title: string
          updated_at: string
        }
        Insert: {
          category?: string
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          prompt: string
          section?: string
          sort_order?: number
          tag?: string | null
          thumbnail_url?: string | null
          title: string
          updated_at?: string
        }
        Update: {
          category?: string
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          prompt?: string
          section?: string
          sort_order?: number
          tag?: string | null
          thumbnail_url?: string | null
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "presets_section_fkey"
            columns: ["section"]
            isOneToOne: false
            referencedRelation: "preset_sections"
            referencedColumns: ["key"]
          },
        ]
      }
      processing_jobs: {
        Row: {
          created_at: string
          error: string | null
          id: string
          progress: number
          result: string | null
          status: string
          updated_at: string
          user_id: string
          video_path: string
        }
        Insert: {
          created_at?: string
          error?: string | null
          id?: string
          progress?: number
          result?: string | null
          status?: string
          updated_at?: string
          user_id: string
          video_path: string
        }
        Update: {
          created_at?: string
          error?: string | null
          id?: string
          progress?: number
          result?: string | null
          status?: string
          updated_at?: string
          user_id?: string
          video_path?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          avatar_url: string | null
          billing_interval: string | null
          company: string | null
          created_at: string
          creator_rank: Database["public"]["Enums"]["creator_rank"]
          current_period_end: string | null
          current_plan_id: string | null
          display_name: string | null
          id: string
          industry: string | null
          is_official: boolean
          role: string | null
          stripe_customer_id: string | null
          stripe_subscription_id: string | null
          subscription_plan_id: string | null
          subscription_status: Database["public"]["Enums"]["subscription_status"]
          updated_at: string
          use_cases: string[] | null
          user_id: string
        }
        Insert: {
          avatar_url?: string | null
          billing_interval?: string | null
          company?: string | null
          created_at?: string
          creator_rank?: Database["public"]["Enums"]["creator_rank"]
          current_period_end?: string | null
          current_plan_id?: string | null
          display_name?: string | null
          id?: string
          industry?: string | null
          is_official?: boolean
          role?: string | null
          stripe_customer_id?: string | null
          stripe_subscription_id?: string | null
          subscription_plan_id?: string | null
          subscription_status?: Database["public"]["Enums"]["subscription_status"]
          updated_at?: string
          use_cases?: string[] | null
          user_id: string
        }
        Update: {
          avatar_url?: string | null
          billing_interval?: string | null
          company?: string | null
          created_at?: string
          creator_rank?: Database["public"]["Enums"]["creator_rank"]
          current_period_end?: string | null
          current_plan_id?: string | null
          display_name?: string | null
          id?: string
          industry?: string | null
          is_official?: boolean
          role?: string | null
          stripe_customer_id?: string | null
          stripe_subscription_id?: string | null
          subscription_plan_id?: string | null
          subscription_status?: Database["public"]["Enums"]["subscription_status"]
          updated_at?: string
          use_cases?: string[] | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "profiles_subscription_plan_id_fkey"
            columns: ["subscription_plan_id"]
            isOneToOne: false
            referencedRelation: "subscription_plans"
            referencedColumns: ["id"]
          },
        ]
      }
      prompt_knowledge: {
        Row: {
          applicable_models: string[] | null
          applicable_platforms: string[] | null
          category: string
          content: string
          created_at: string
          feature: string
          id: string
          is_active: boolean
          sort_order: number | null
          tags: string[] | null
          title: string
          updated_at: string
        }
        Insert: {
          applicable_models?: string[] | null
          applicable_platforms?: string[] | null
          category: string
          content: string
          created_at?: string
          feature: string
          id?: string
          is_active?: boolean
          sort_order?: number | null
          tags?: string[] | null
          title: string
          updated_at?: string
        }
        Update: {
          applicable_models?: string[] | null
          applicable_platforms?: string[] | null
          category?: string
          content?: string
          created_at?: string
          feature?: string
          id?: string
          is_active?: boolean
          sort_order?: number | null
          tags?: string[] | null
          title?: string
          updated_at?: string
        }
        Relationships: []
      }
      provider_retry_queue: {
        Row: {
          attempt: number
          completed_at: string | null
          created_at: string
          flow_run_id: string
          id: string
          last_classification: string | null
          last_error: string | null
          lock_expires_at: string | null
          locked_at: string | null
          locked_by: string | null
          max_attempts: number
          next_attempt_at: string
          node_id: string | null
          node_type: string
          provider: string
          resume_payload: Json
          status: Database["public"]["Enums"]["retry_job_status"]
          step_index: number
          updated_at: string
        }
        Insert: {
          attempt?: number
          completed_at?: string | null
          created_at?: string
          flow_run_id: string
          id?: string
          last_classification?: string | null
          last_error?: string | null
          lock_expires_at?: string | null
          locked_at?: string | null
          locked_by?: string | null
          max_attempts?: number
          next_attempt_at?: string
          node_id?: string | null
          node_type: string
          provider: string
          resume_payload: Json
          status?: Database["public"]["Enums"]["retry_job_status"]
          step_index: number
          updated_at?: string
        }
        Update: {
          attempt?: number
          completed_at?: string | null
          created_at?: string
          flow_run_id?: string
          id?: string
          last_classification?: string | null
          last_error?: string | null
          lock_expires_at?: string | null
          locked_at?: string | null
          locked_by?: string | null
          max_attempts?: number
          next_attempt_at?: string
          node_id?: string | null
          node_type?: string
          provider?: string
          resume_payload?: Json
          status?: Database["public"]["Enums"]["retry_job_status"]
          step_index?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "provider_retry_queue_flow_run_id_fkey"
            columns: ["flow_run_id"]
            isOneToOne: false
            referencedRelation: "flow_runs"
            referencedColumns: ["id"]
          },
        ]
      }
      rate_limits: {
        Row: {
          created_at: string
          endpoint: string
          id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          endpoint: string
          id?: string
          user_id: string
        }
        Update: {
          created_at?: string
          endpoint?: string
          id?: string
          user_id?: string
        }
        Relationships: []
      }
      redemption_codes: {
        Row: {
          billing_cycle: string
          code: string
          created_at: string
          credits: number
          customer_email: string | null
          expires_at: string | null
          id: string
          plan_id: string | null
          plan_name: string
          price_thb: number | null
          redeemed_at: string | null
          redeemed_by: string | null
          status: string
          stripe_session_id: string | null
        }
        Insert: {
          billing_cycle?: string
          code: string
          created_at?: string
          credits?: number
          customer_email?: string | null
          expires_at?: string | null
          id?: string
          plan_id?: string | null
          plan_name?: string
          price_thb?: number | null
          redeemed_at?: string | null
          redeemed_by?: string | null
          status?: string
          stripe_session_id?: string | null
        }
        Update: {
          billing_cycle?: string
          code?: string
          created_at?: string
          credits?: number
          customer_email?: string | null
          expires_at?: string | null
          id?: string
          plan_id?: string | null
          plan_name?: string
          price_thb?: number | null
          redeemed_at?: string | null
          redeemed_by?: string | null
          status?: string
          stripe_session_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "redemption_codes_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "subscription_plans"
            referencedColumns: ["id"]
          },
        ]
      }
      referral_clicks: {
        Row: {
          clicked_at: string | null
          code: string
          code_id: string | null
          country_code: string | null
          device_fp: string | null
          id: number
          ip_hash: string | null
          landing_path: string | null
          referrer_url: string | null
          user_agent: string | null
          utm_campaign: string | null
          utm_medium: string | null
          utm_source: string | null
        }
        Insert: {
          clicked_at?: string | null
          code: string
          code_id?: string | null
          country_code?: string | null
          device_fp?: string | null
          id?: number
          ip_hash?: string | null
          landing_path?: string | null
          referrer_url?: string | null
          user_agent?: string | null
          utm_campaign?: string | null
          utm_medium?: string | null
          utm_source?: string | null
        }
        Update: {
          clicked_at?: string | null
          code?: string
          code_id?: string | null
          country_code?: string | null
          device_fp?: string | null
          id?: number
          ip_hash?: string | null
          landing_path?: string | null
          referrer_url?: string | null
          user_agent?: string | null
          utm_campaign?: string | null
          utm_medium?: string | null
          utm_source?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "referral_clicks_code_id_fkey"
            columns: ["code_id"]
            isOneToOne: false
            referencedRelation: "referral_codes"
            referencedColumns: ["id"]
          },
        ]
      }
      referral_codes: {
        Row: {
          campaign_label: string | null
          code: string
          code_type: string
          created_at: string | null
          id: string
          is_active: boolean | null
          user_id: string
        }
        Insert: {
          campaign_label?: string | null
          code: string
          code_type: string
          created_at?: string | null
          id?: string
          is_active?: boolean | null
          user_id: string
        }
        Update: {
          campaign_label?: string | null
          code?: string
          code_type?: string
          created_at?: string | null
          id?: string
          is_active?: boolean | null
          user_id?: string
        }
        Relationships: []
      }
      referral_credit_grants: {
        Row: {
          created_at: string | null
          credits_amount: number
          granted_at: string | null
          id: string
          locked_reason: string | null
          referral_id: string
          status: string | null
          user_id: string
        }
        Insert: {
          created_at?: string | null
          credits_amount?: number
          granted_at?: string | null
          id?: string
          locked_reason?: string | null
          referral_id: string
          status?: string | null
          user_id: string
        }
        Update: {
          created_at?: string | null
          credits_amount?: number
          granted_at?: string | null
          id?: string
          locked_reason?: string | null
          referral_id?: string
          status?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "referral_credit_grants_referral_id_fkey"
            columns: ["referral_id"]
            isOneToOne: true
            referencedRelation: "referrals"
            referencedColumns: ["id"]
          },
        ]
      }
      referrals: {
        Row: {
          attribution_status: string
          code_id: string
          code_type: string
          commission_window_ends_at: string | null
          confirmed_at: string | null
          created_at: string | null
          id: string
          referred_user_id: string
          referrer_user_id: string
          risk_flags: Json | null
          risk_score: number | null
          signup_country: string | null
          signup_device_fp: string | null
          signup_ip_hash: string | null
        }
        Insert: {
          attribution_status?: string
          code_id: string
          code_type: string
          commission_window_ends_at?: string | null
          confirmed_at?: string | null
          created_at?: string | null
          id?: string
          referred_user_id: string
          referrer_user_id: string
          risk_flags?: Json | null
          risk_score?: number | null
          signup_country?: string | null
          signup_device_fp?: string | null
          signup_ip_hash?: string | null
        }
        Update: {
          attribution_status?: string
          code_id?: string
          code_type?: string
          commission_window_ends_at?: string | null
          confirmed_at?: string | null
          created_at?: string | null
          id?: string
          referred_user_id?: string
          referrer_user_id?: string
          risk_flags?: Json | null
          risk_score?: number | null
          signup_country?: string | null
          signup_device_fp?: string | null
          signup_ip_hash?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "referrals_code_id_fkey"
            columns: ["code_id"]
            isOneToOne: false
            referencedRelation: "referral_codes"
            referencedColumns: ["id"]
          },
        ]
      }
      retry_queue_dead_letter: {
        Row: {
          final_error: string | null
          flow_run_id: string | null
          id: string
          moved_at: string
          moved_by: string | null
          original_job_id: string
          payload: Json
          provider: string | null
          step_index: number | null
          task_type: string
          total_attempts: number
        }
        Insert: {
          final_error?: string | null
          flow_run_id?: string | null
          id?: string
          moved_at?: string
          moved_by?: string | null
          original_job_id: string
          payload: Json
          provider?: string | null
          step_index?: number | null
          task_type: string
          total_attempts: number
        }
        Update: {
          final_error?: string | null
          flow_run_id?: string | null
          id?: string
          moved_at?: string
          moved_by?: string | null
          original_job_id?: string
          payload?: Json
          provider?: string | null
          step_index?: number | null
          task_type?: string
          total_attempts?: number
        }
        Relationships: []
      }
      space_edges: {
        Row: {
          created_at: string
          id: string
          source_handle: string | null
          source_node_id: string
          space_id: string
          target_handle: string | null
          target_node_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          source_handle?: string | null
          source_node_id: string
          space_id: string
          target_handle?: string | null
          target_node_id: string
        }
        Update: {
          created_at?: string
          id?: string
          source_handle?: string | null
          source_node_id?: string
          space_id?: string
          target_handle?: string | null
          target_node_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "space_edges_source_node_id_fkey"
            columns: ["source_node_id"]
            isOneToOne: false
            referencedRelation: "space_nodes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "space_edges_space_id_fkey"
            columns: ["space_id"]
            isOneToOne: false
            referencedRelation: "spaces"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "space_edges_target_node_id_fkey"
            columns: ["target_node_id"]
            isOneToOne: false
            referencedRelation: "space_nodes"
            referencedColumns: ["id"]
          },
        ]
      }
      space_nodes: {
        Row: {
          created_at: string
          data: Json
          height: number | null
          id: string
          position_x: number
          position_y: number
          space_id: string
          type: string
          updated_at: string
          width: number | null
        }
        Insert: {
          created_at?: string
          data?: Json
          height?: number | null
          id?: string
          position_x?: number
          position_y?: number
          space_id: string
          type: string
          updated_at?: string
          width?: number | null
        }
        Update: {
          created_at?: string
          data?: Json
          height?: number | null
          id?: string
          position_x?: number
          position_y?: number
          space_id?: string
          type?: string
          updated_at?: string
          width?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "space_nodes_space_id_fkey"
            columns: ["space_id"]
            isOneToOne: false
            referencedRelation: "spaces"
            referencedColumns: ["id"]
          },
        ]
      }
      spaces: {
        Row: {
          created_at: string
          description: string | null
          id: string
          name: string
          thumbnail_url: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          name?: string
          thumbnail_url?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          name?: string
          thumbnail_url?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      stock_downloads: {
        Row: {
          created_at: string
          download_url: string | null
          id: string
          resource_id: string
          resource_title: string | null
          source: string
          user_id: string
        }
        Insert: {
          created_at?: string
          download_url?: string | null
          id?: string
          resource_id: string
          resource_title?: string | null
          source?: string
          user_id: string
        }
        Update: {
          created_at?: string
          download_url?: string | null
          id?: string
          resource_id?: string
          resource_title?: string | null
          source?: string
          user_id?: string
        }
        Relationships: []
      }
      subscription_plans: {
        Row: {
          billing_cycle: string
          cashback_percent: number
          created_at: string
          discount_community: number
          discount_official: number
          flow_quota: number | null
          id: string
          is_active: boolean
          name: string
          price_thb: number
          sort_order: number
          stripe_price_id: string | null
          stripe_product_id: string | null
          target: string
          updated_at: string
          upfront_credits: number
        }
        Insert: {
          billing_cycle?: string
          cashback_percent?: number
          created_at?: string
          discount_community?: number
          discount_official?: number
          flow_quota?: number | null
          id?: string
          is_active?: boolean
          name: string
          price_thb?: number
          sort_order?: number
          stripe_price_id?: string | null
          stripe_product_id?: string | null
          target?: string
          updated_at?: string
          upfront_credits?: number
        }
        Update: {
          billing_cycle?: string
          cashback_percent?: number
          created_at?: string
          discount_community?: number
          discount_official?: number
          flow_quota?: number | null
          id?: string
          is_active?: boolean
          name?: string
          price_thb?: number
          sort_order?: number
          stripe_price_id?: string | null
          stripe_product_id?: string | null
          target?: string
          updated_at?: string
          upfront_credits?: number
        }
        Relationships: []
      }
      subscription_settings: {
        Row: {
          id: string
          key: string
          updated_at: string
          value: string
        }
        Insert: {
          id?: string
          key: string
          updated_at?: string
          value: string
        }
        Update: {
          id?: string
          key?: string
          updated_at?: string
          value?: string
        }
        Relationships: []
      }
      suppressed_emails: {
        Row: {
          created_at: string
          email: string
          id: string
          metadata: Json | null
          reason: string
        }
        Insert: {
          created_at?: string
          email: string
          id?: string
          metadata?: Json | null
          reason: string
        }
        Update: {
          created_at?: string
          email?: string
          id?: string
          metadata?: Json | null
          reason?: string
        }
        Relationships: []
      }
      system_prompt_versions: {
        Row: {
          change_note: string | null
          changed_by: string
          content: string
          created_at: string
          id: string
          version: number
        }
        Insert: {
          change_note?: string | null
          changed_by: string
          content: string
          created_at?: string
          id?: string
          version: number
        }
        Update: {
          change_note?: string | null
          changed_by?: string
          content?: string
          created_at?: string
          id?: string
          version?: number
        }
        Relationships: []
      }
      topup_packages: {
        Row: {
          badge_label: string | null
          bonus_percent: number | null
          created_at: string
          credits: number
          id: string
          is_active: boolean
          is_promo: boolean
          name: string
          one_time_per_user: boolean
          original_credits: number | null
          price_thb: number
          sort_order: number
          stripe_price_id: string | null
          stripe_product_id: string | null
        }
        Insert: {
          badge_label?: string | null
          bonus_percent?: number | null
          created_at?: string
          credits: number
          id?: string
          is_active?: boolean
          is_promo?: boolean
          name: string
          one_time_per_user?: boolean
          original_credits?: number | null
          price_thb: number
          sort_order?: number
          stripe_price_id?: string | null
          stripe_product_id?: string | null
        }
        Update: {
          badge_label?: string | null
          bonus_percent?: number | null
          created_at?: string
          credits?: number
          id?: string
          is_active?: boolean
          is_promo?: boolean
          name?: string
          one_time_per_user?: boolean
          original_credits?: number | null
          price_thb?: number
          sort_order?: number
          stripe_price_id?: string | null
          stripe_product_id?: string | null
        }
        Relationships: []
      }
      topup_redemptions: {
        Row: {
          created_at: string
          credits_granted: number
          id: string
          price_thb: number
          stripe_session_id: string | null
          topup_package_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          credits_granted: number
          id?: string
          price_thb: number
          stripe_session_id?: string | null
          topup_package_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          credits_granted?: number
          id?: string
          price_thb?: number
          stripe_session_id?: string | null
          topup_package_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "topup_redemptions_topup_package_id_fkey"
            columns: ["topup_package_id"]
            isOneToOne: false
            referencedRelation: "topup_packages"
            referencedColumns: ["id"]
          },
        ]
      }
      user_assets: {
        Row: {
          category: string | null
          content_hash: string | null
          created_at: string
          file_type: string
          file_url: string
          id: string
          is_favorite: boolean | null
          metadata: Json | null
          name: string
          source: string
          thumbnail_url: string | null
          user_id: string
        }
        Insert: {
          category?: string | null
          content_hash?: string | null
          created_at?: string
          file_type?: string
          file_url: string
          id?: string
          is_favorite?: boolean | null
          metadata?: Json | null
          name: string
          source?: string
          thumbnail_url?: string | null
          user_id: string
        }
        Update: {
          category?: string | null
          content_hash?: string | null
          created_at?: string
          file_type?: string
          file_url?: string
          id?: string
          is_favorite?: boolean | null
          metadata?: Json | null
          name?: string
          source?: string
          thumbnail_url?: string | null
          user_id?: string
        }
        Relationships: []
      }
      user_credits: {
        Row: {
          balance: number
          created_at: string
          id: string
          total_purchased: number
          total_used: number
          updated_at: string
          user_id: string
        }
        Insert: {
          balance?: number
          created_at?: string
          id?: string
          total_purchased?: number
          total_used?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          balance?: number
          created_at?: string
          id?: string
          total_purchased?: number
          total_used?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      user_personas: {
        Row: {
          ai_experience: string | null
          content_frequency: string | null
          created_at: string
          credits_awarded: boolean
          favorite_feature: string | null
          first_login_at: string | null
          id: string
          last_visit_date: string | null
          onboarding_completed: boolean
          profession: string | null
          survey_data: Json | null
          survey_skipped_at: string | null
          updated_at: string
          use_case: string | null
          user_id: string
          visit_count: number
        }
        Insert: {
          ai_experience?: string | null
          content_frequency?: string | null
          created_at?: string
          credits_awarded?: boolean
          favorite_feature?: string | null
          first_login_at?: string | null
          id?: string
          last_visit_date?: string | null
          onboarding_completed?: boolean
          profession?: string | null
          survey_data?: Json | null
          survey_skipped_at?: string | null
          updated_at?: string
          use_case?: string | null
          user_id: string
          visit_count?: number
        }
        Update: {
          ai_experience?: string | null
          content_frequency?: string | null
          created_at?: string
          credits_awarded?: boolean
          favorite_feature?: string | null
          first_login_at?: string | null
          id?: string
          last_visit_date?: string | null
          onboarding_completed?: boolean
          profession?: string | null
          survey_data?: Json | null
          survey_skipped_at?: string | null
          updated_at?: string
          use_case?: string | null
          user_id?: string
          visit_count?: number
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      creator_stats: {
        Row: {
          avg_rating: number | null
          creator_id: string | null
          total_credits_earned: number | null
          total_flows: number | null
          total_uses: number | null
        }
        Relationships: []
      }
      profiles_public: {
        Row: {
          avatar_url: string | null
          display_name: string | null
          user_id: string | null
        }
        Insert: {
          avatar_url?: string | null
          display_name?: string | null
          user_id?: string | null
        }
        Update: {
          avatar_url?: string | null
          display_name?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
    }
    Functions: {
      accrue_commission: {
        Args: {
          p_billing_cycle: string
          p_cycle_index: number
          p_gross_amount_thb: number
          p_net_amount_thb: number
          p_referred_user_id: string
          p_stripe_invoice_id: string
        }
        Returns: string
      }
      approve_payout: { Args: { p_payout_id: string }; Returns: undefined }
      approve_payout_v2: {
        Args: { p_admin_id: string; p_note?: string; p_payout_id: string }
        Returns: Json
      }
      calculate_flow_pricing: {
        Args: { p_api_cost: number; p_tier?: string }
        Returns: {
          contribution_margin: number
          creator_payout: number
          selling_price: number
        }[]
      }
      cancel_retry_job: { Args: { p_job_id: string }; Returns: undefined }
      check_rate_limit: {
        Args: {
          p_endpoint: string
          p_max_requests?: number
          p_user_id: string
          p_window_seconds?: number
        }
        Returns: boolean
      }
      claim_retry_jobs: {
        Args: {
          p_batch_size?: number
          p_lock_duration_sec?: number
          p_worker_id: string
        }
        Returns: {
          attempt: number
          completed_at: string | null
          created_at: string
          flow_run_id: string
          id: string
          last_classification: string | null
          last_error: string | null
          lock_expires_at: string | null
          locked_at: string | null
          locked_by: string | null
          max_attempts: number
          next_attempt_at: string
          node_id: string | null
          node_type: string
          provider: string
          resume_payload: Json
          status: Database["public"]["Enums"]["retry_job_status"]
          step_index: number
          updated_at: string
        }[]
        SetofOptions: {
          from: "*"
          to: "provider_retry_queue"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      cleanup_old_analytics_rpc: { Args: never; Returns: undefined }
      complete_retry_job: { Args: { p_job_id: string }; Returns: undefined }
      compute_referral_risk_score: {
        Args: { p_referral_id: string }
        Returns: number
      }
      consume_credits: {
        Args: {
          p_amount: number
          p_description?: string
          p_feature?: string
          p_reference_id?: string
          p_user_id: string
        }
        Returns: boolean
      }
      debug_add_credits: {
        Args: { p_amount: number; p_user_id: string }
        Returns: undefined
      }
      debug_commission_timeline: {
        Args: { p_target_user_id: string }
        Returns: {
          available_at: string
          billing_cycle: string
          commission_amount_thb: number
          commission_id: string
          created_at: string
          cycle_index: number
          gross_amount_thb: number
          hold_until: string
          net_amount_thb: number
          paid_at: string
          referral_id: string
          referred_user_email: string
          reversal_reason: string
          reversed_at: string
          status: string
          stripe_invoice_id: string
          stripe_payment_intent_id: string
        }[]
      }
      debug_create_test_referral: {
        Args: {
          p_actor_id?: string
          p_partner_user_id: string
          p_referred_email: string
        }
        Returns: Json
      }
      debug_fast_forward_commissions: {
        Args: { p_actor_id?: string; p_target_user_id?: string }
        Returns: {
          commissions_released: number
          commissions_updated: number
        }[]
      }
      debug_set_balance: {
        Args: { p_balance: number; p_user_id: string }
        Returns: undefined
      }
      delete_email: {
        Args: { message_id: number; queue_name: string }
        Returns: boolean
      }
      delete_flow_with_dependencies: {
        Args: { p_flow_id: string }
        Returns: boolean
      }
      detect_refund_velocity: {
        Args: never
        Returns: {
          partner_user_id: string
          refund_rate: number
          total_paying: number
        }[]
      }
      enqueue_email: {
        Args: { payload: Json; queue_name: string }
        Returns: number
      }
      enqueue_retry_job: {
        Args: {
          p_classification?: string
          p_first_delay_sec?: number
          p_flow_run_id: string
          p_initial_attempt?: number
          p_last_error?: string
          p_max_attempts?: number
          p_node_id: string
          p_node_type: string
          p_provider: string
          p_resume_payload: Json
          p_step_index: number
        }
        Returns: string
      }
      escalate_to_dead_letter: {
        Args: { p_final_error: string; p_job_id: string; p_moved_by?: string }
        Returns: string
      }
      expire_credit_batches: { Args: never; Returns: number }
      fail_retry_job: {
        Args: { p_classification: string; p_error: string; p_job_id: string }
        Returns: {
          attempt: number
          final_status: Database["public"]["Enums"]["retry_job_status"]
        }[]
      }
      flag_high_refund_partners: { Args: never; Returns: number }
      get_my_creator_stats: {
        Args: never
        Returns: {
          avg_rating: number
          creator_id: string
          total_credits_earned: number
          total_flows: number
          total_uses: number
        }[]
      }
      get_retry_worker_cron_secret: { Args: never; Returns: string }
      grant_credits: {
        Args: {
          p_amount: number
          p_description?: string
          p_expiry_days?: number
          p_reference_id?: string
          p_source_type?: string
          p_user_id: string
        }
        Returns: undefined
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      mark_payout_paid: {
        Args: { p_bank_reference: string; p_payout_id: string }
        Returns: undefined
      }
      mark_payout_paid_v2: {
        Args: {
          p_admin_id: string
          p_bank_ref: string
          p_paid_at?: string
          p_payout_id: string
        }
        Returns: Json
      }
      match_flows: {
        Args: {
          match_count?: number
          match_threshold?: number
          query_embedding: string
          search_query?: string
        }
        Returns: {
          base_cost: number
          category: string
          combined_score: number
          description: string
          id: string
          is_official: boolean
          keyword_score: number
          keywords: string[]
          name: string
          selling_price: number
          similarity: number
          status: string
          tags: string[]
          thumbnail_url: string
          user_id: string
        }[]
      }
      move_to_dlq: {
        Args: {
          dlq_name: string
          message_id: number
          payload: Json
          source_queue: string
        }
        Returns: number
      }
      read_email_batch: {
        Args: { batch_size: number; queue_name: string; vt: number }
        Returns: {
          message: Json
          msg_id: number
          read_ct: number
        }[]
      }
      recover_stuck_retry_jobs: {
        Args: { p_stuck_after_minutes?: number }
        Returns: {
          prior_attempt: number
          prior_locked_by: string
          recovered_id: string
        }[]
      }
      redeem_demo_link: { Args: { p_token: string }; Returns: Json }
      refund_commission: {
        Args: { p_commission_event_id: string }
        Returns: boolean
      }
      refund_credits: {
        Args: {
          p_amount: number
          p_reason?: string
          p_reference_id?: string
          p_user_id: string
        }
        Returns: undefined
      }
      reject_payout: {
        Args: { p_payout_id: string; p_reason: string }
        Returns: undefined
      }
      reject_payout_v2: {
        Args: { p_admin_id: string; p_payout_id: string; p_reason: string }
        Returns: Json
      }
      release_commission: { Args: never; Returns: number }
      release_worker_locks: { Args: { p_worker_id: string }; Returns: number }
      request_payout:
        | {
            Args: { p_amount_thb: number; p_bank_snapshot: Json }
            Returns: string
          }
        | {
            Args: { p_amount_thb: number; p_bank_snapshot: Json }
            Returns: string
          }
      reverse_commission: {
        Args: {
          p_payment_intent_id: string
          p_reason?: string
          p_refund_id: string
        }
        Returns: {
          commission_event_id: string
          partner_user_id: string
          reversed_amount_thb: number
        }[]
      }
      search_bundles_hybrid: {
        Args: { match_limit?: number; search_query: string }
        Returns: {
          categories: string[]
          description: string
          flow_count: number
          id: string
          is_official: boolean
          keywords: string[]
          match_score: number
          name: string
          tags: string[]
          thumbnail_type: string
          thumbnail_url: string
          user_id: string
        }[]
      }
    }
    Enums: {
      app_role: "admin" | "user" | "creator"
      creator_rank: "novice" | "rising_star" | "top_rated" | "elite"
      retry_job_status:
        | "pending"
        | "processing"
        | "succeeded"
        | "failed"
        | "dead"
        | "cancelled"
        | "dead_letter"
      subscription_status: "free" | "professional" | "agency"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      app_role: ["admin", "user", "creator"],
      creator_rank: ["novice", "rising_star", "top_rated", "elite"],
      retry_job_status: [
        "pending",
        "processing",
        "succeeded",
        "failed",
        "dead",
        "cancelled",
        "dead_letter",
      ],
      subscription_status: ["free", "professional", "agency"],
    },
  },
} as const
